document.addEventListener('DOMContentLoaded', async () => {
    // Check if we're in a Websim environment
    const isWebsim = typeof window.websim !== 'undefined';
    
    let currentProject = null;
    let currentUser = null;

    try {
        if (isWebsim) {
            // Get current project info from Websim API
            currentProject = await window.websim.getCurrentProject();
            currentUser = await window.websim.getUser();
            
            // Update project info section
            displayProjectInfo(currentProject);
            
            // Load comments for the current project
            await loadComments(currentProject.id);
            
            // Setup comment form event listener
            setupCommentForm(currentProject.id);
        } else {
            // Demo mode with sample data for when not running in Websim
            useDemoData();
        }
    } catch (error) {
        console.error('Error initializing comments:', error);
        document.getElementById('comments-container').innerHTML = `
            <div class="error-message">
                <p>Error loading comments: ${error.message}</p>
            </div>
        `;
    }

    // Load comments from the API
    async function loadComments(projectId) {
        try {
            const response = await fetch(`/api/v1/projects/${projectId}/comments`);
            
            if (!response.ok) {
                throw new Error(`Failed to load comments: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.comments && data.comments.data) {
                renderComments(data.comments.data);
            } else {
                document.getElementById('comments-container').innerHTML = '<div class="no-comments">No comments yet. Be the first to comment!</div>';
            }
        } catch (error) {
            console.error('Error loading comments:', error);
            document.getElementById('comments-container').innerHTML = `
                <div class="error-message">
                    <p>Error loading comments: ${error.message}</p>
                </div>
            `;
        }
    }

    // Render comments to the DOM
    function renderComments(commentsData) {
        const commentsContainer = document.getElementById('comments-container');
        
        if (commentsData.length === 0) {
            commentsContainer.innerHTML = '<div class="no-comments">No comments yet. Be the first to comment!</div>';
            return;
        }
        
        let commentsHTML = '';
        
        // Sort comments - pinned first, then by date (newest first)
        const sortedComments = [...commentsData].sort((a, b) => {
            if (a.comment.pinned && !b.comment.pinned) return -1;
            if (!a.comment.pinned && b.comment.pinned) return 1;
            
            return new Date(b.comment.created_at) - new Date(a.comment.created_at);
        });
        
        for (const { comment, cursor } of sortedComments) {
            // Skip replies (they will be handled in the parent comment)
            if (comment.parent_comment_id) continue;
            
            commentsHTML += createCommentHTML(comment, cursor, sortedComments);
        }
        
        commentsContainer.innerHTML = commentsHTML;
        
        // Add event listeners to all reaction buttons
        attachReactionEventListeners();
        
        // Add event listeners to reply links
        attachReplyEventListeners();
    }

    // Create HTML for a single comment and its replies
    function createCommentHTML(comment, cursor, allComments) {
        if (comment.deleted) {
            return `
                <div class="comment" data-comment-id="${comment.id}" data-cursor="${cursor}">
                    <div class="comment-content deleted-comment">
                        <em>This comment has been deleted</em>
                    </div>
                </div>
            `;
        }
        
        const authorUsername = comment.author ? comment.author.username : '[deleted]';
        const avatarUrl = comment.author && comment.author.avatar_url ? 
            comment.author.avatar_url : 
            'https://images.websim.ai/avatar/default';
        
        const formattedDate = formatDate(comment.created_at);
        
        // Parse and format comment content
        let contentHTML = '';
        if (comment.content && comment.content.children) {
            contentHTML = formatDocumentContent(comment.content);
        } else if (comment.raw_content) {
            contentHTML = `<p>${escapeHtml(comment.raw_content)}</p>`;
        } else {
            contentHTML = '<p><em>No content</em></p>';
        }
        
        // Create reactions HTML
        const reactionsHTML = createReactionsHTML(comment.reactions);
        
        // Find replies to this comment
        const replies = allComments
            .filter(c => c.comment.parent_comment_id === comment.id)
            .sort((a, b) => new Date(a.comment.created_at) - new Date(b.comment.created_at));
        
        let repliesHTML = '';
        if (replies.length > 0) {
            repliesHTML = '<div class="replies-container">';
            for (const { comment: reply, cursor: replyCursor } of replies) {
                repliesHTML += createCommentHTML(reply, replyCursor, allComments);
            }
            repliesHTML += '</div>';
        }
        
        // Create the pinned badge if comment is pinned
        const pinnedBadge = comment.pinned ? 
            `<span class="pinned-badge">Pinned by ${comment.pinned_by ? comment.pinned_by.username : 'moderator'}</span>` : '';
        
        return `
            <div class="comment" data-comment-id="${comment.id}" data-cursor="${cursor}">
                <div class="comment-header">
                    <img class="avatar" src="${avatarUrl}" alt="${authorUsername}'s avatar">
                    <a href="https://websim.ai/@${authorUsername}" class="user-name">@${authorUsername}</a>
                    ${pinnedBadge}
                    <span class="comment-date">${formattedDate}</span>
                </div>
                <div class="comment-content">
                    ${contentHTML}
                </div>
                <div class="comment-footer">
                    <div class="reactions">${reactionsHTML}</div>
                    <a href="#" class="reply-link" data-comment-id="${comment.id}">Reply</a>
                </div>
                ${repliesHTML}
            </div>
        `;
    }

    // Create HTML for reaction buttons
    function createReactionsHTML(reactions) {
        if (!reactions || reactions.length === 0) {
            return `
                <div class="reaction add-reaction" data-emoji="👍">
                    <span>👍</span>
                    <span class="reaction-count">0</span>
                </div>
                <div class="reaction add-reaction" data-emoji="❤️">
                    <span>❤️</span>
                    <span class="reaction-count">0</span>
                </div>
            `;
        }
        
        // Sort reactions - put "me" reactions first, then by count
        const sortedReactions = [...reactions].sort((a, b) => {
            if (a.me && !b.me) return -1;
            if (!a.me && b.me) return 1;
            return b.count - a.count;
        });
        
        return sortedReactions.map(reaction => {
            const emoji = reaction.emoji.name;
            const count = reaction.count;
            const activeClass = reaction.me ? 'active-reaction' : '';
            
            return `
                <div class="reaction ${activeClass}" data-emoji="${emoji}">
                    <span>${emoji}</span>
                    <span class="reaction-count">${count}</span>
                </div>
            `;
        }).join('');
    }

    // Format the date in a readable way
    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffSec < 60) {
            return 'just now';
        } else if (diffMin < 60) {
            return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }
    }

    // Format the document content from the API
    function formatDocumentContent(document) {
        if (!document || !document.children) {
            return '<p><em>No content</em></p>';
        }
        
        let html = '';
        
        for (const block of document.children) {
            switch (block.type) {
                case 'paragraph':
                    html += `<p>${formatInlineContent(block.children)}</p>`;
                    break;
                    
                case 'list':
                    const listTag = block.ordered ? 'ol' : 'ul';
                    const startAttr = block.ordered && block.start ? ` start="${block.start}"` : '';
                    
                    html += `<${listTag}${startAttr}>`;
                    for (const item of block.children) {
                        html += '<li>';
                        if (item.children) {
                            for (const child of item.children) {
                                if (child.type === 'paragraph') {
                                    html += formatInlineContent(child.children);
                                } else {
                                    // Handle other block types in list items if needed
                                    html += `<div>[Unsupported block type: ${child.type}]</div>`;
                                }
                            }
                        }
                        html += '</li>';
                    }
                    html += `</${listTag}>`;
                    break;
                    
                case 'site_block':
                    html += `<div class="site-block">
                        <a href="${block.url}" target="_blank" rel="noopener noreferrer">
                            ${block.title || 'Visit Site'}
                        </a>
                    </div>`;
                    break;
                    
                case 'project_block':
                    html += `<div class="project-block">
                        <a href="https://websim.ai/p/${block.id}" target="_blank" rel="noopener noreferrer">
                            Project: ${block.id}
                        </a>
                    </div>`;
                    break;
                    
                default:
                    html += `<div>[Unsupported block type: ${block.type}]</div>`;
            }
        }
        
        return html;
    }

    // Format inline content (text, links, etc.)
    function formatInlineContent(inlineNodes) {
        if (!inlineNodes || !Array.isArray(inlineNodes)) {
            return '';
        }
        
        let html = '';
        
        for (const node of inlineNodes) {
            switch (node.type) {
                case 'text':
                    let textContent = escapeHtml(node.text);
                    
                    if (node.bold) textContent = `<strong>${textContent}</strong>`;
                    if (node.italic) textContent = `<em>${textContent}</em>`;
                    if (node.underline) textContent = `<u>${textContent}</u>`;
                    if (node.strike) textContent = `<s>${textContent}</s>`;
                    
                    html += textContent;
                    break;
                    
                case 'break':
                    html += '<br>';
                    break;
                    
                case 'link':
                    let linkContent = '';
                    if (node.children) {
                        linkContent = formatInlineContent(node.children);
                    }
                    html += `<a href="${escapeHtml(node.url)}" target="_blank" rel="noopener noreferrer">${linkContent || node.url}</a>`;
                    break;
                    
                case 'user':
                    const username = node.username || '[user]';
                    html += `<a href="https://websim.ai/@${username}" class="user-mention">@${username}</a>`;
                    break;
                    
                case 'site':
                    const siteTitle = node.title || 'Site';
                    html += `<a href="${node.url}" class="site-mention">${siteTitle}</a>`;
                    break;
                    
                case 'project':
                    html += `<a href="https://websim.ai/p/${node.id}" class="project-mention">Project: ${node.id}</a>`;
                    break;
                    
                case 'image':
                    const altText = node.alt || 'Image';
                    html += `<img src="${node.url}" alt="${altText}" style="max-width: 100%;">`;
                    break;
                    
                default:
                    html += `[Unsupported inline type: ${node.type}]`;
            }
        }
        
        return html;
    }

    // Escape HTML to prevent XSS
    function escapeHtml(str) {
        if (!str) return '';
        
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Display project information
    function displayProjectInfo(project) {
        const projectInfoElement = document.getElementById('project-info');
        
        if (project) {
            projectInfoElement.innerHTML = `
                <h2>${project.title || 'Untitled Project'}</h2>
                <p>${project.description || 'No description provided'}</p>
            `;
        } else {
            projectInfoElement.innerHTML = '<p>Project information not available</p>';
        }
    }

    // Setup comment form submission
    function setupCommentForm(projectId) {
        const commentForm = document.getElementById('comment-form');
        
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const contentTextarea = document.getElementById('comment-content');
            const content = contentTextarea.value.trim();
            
            if (!content) return;
            
            try {
                // Disable the form while submitting
                const submitButton = commentForm.querySelector('button[type="submit"]');
                submitButton.disabled = true;
                submitButton.textContent = 'Posting...';
                
                const response = await fetch(`/api/v1/projects/${projectId}/comments`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ content }),
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to post comment: ${response.status}`);
                }
                
                // Clear the form and reload comments
                contentTextarea.value = '';
                await loadComments(projectId);
                
            } catch (error) {
                console.error('Error posting comment:', error);
                alert(`Error posting comment: ${error.message}`);
            } finally {
                // Re-enable the form
                const submitButton = commentForm.querySelector('button[type="submit"]');
                submitButton.disabled = false;
                submitButton.textContent = 'Post Comment';
            }
        });
    }

    // Attach event listeners to reaction buttons
    function attachReactionEventListeners() {
        const reactionButtons = document.querySelectorAll('.reaction');
        
        reactionButtons.forEach(button => {
            button.addEventListener('click', async () => {
                if (!currentProject || !isWebsim) return;
                
                const commentElement = button.closest('.comment');
                const commentId = commentElement.dataset.commentId;
                const emoji = button.dataset.emoji;
                const isActive = button.classList.contains('active-reaction');
                
                try {
                    const endpoint = `/api/v1/projects/${currentProject.id}/comments/${commentId}/reactions`;
                    const method = isActive ? 'DELETE' : 'POST';
                    
                    const response = await fetch(endpoint, {
                        method,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ emoji }),
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed to ${isActive ? 'remove' : 'add'} reaction: ${response.status}`);
                    }
                    
                    // Update UI
                    const data = await response.json();
                    const newReactionsHTML = createReactionsHTML(data.comment.reactions);
                    commentElement.querySelector('.reactions').innerHTML = newReactionsHTML;
                    
                    // Reattach event listeners
                    attachReactionEventListeners();
                    
                } catch (error) {
                    console.error('Error handling reaction:', error);
                    alert(`Error: ${error.message}`);
                }
            });
        });
    }

    // Attach event listeners to reply links
    function attachReplyEventListeners() {
        const replyLinks = document.querySelectorAll('.reply-link');
        
        replyLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Remove any existing reply forms
                const existingForms = document.querySelectorAll('.reply-form');
                existingForms.forEach(form => form.remove());
                
                const commentElement = link.closest('.comment');
                const commentId = link.dataset.commentId;
                
                // Create and insert reply form
                const replyForm = document.createElement('div');
                replyForm.className = 'reply-form';
                replyForm.innerHTML = `
                    <textarea class="reply-textarea" placeholder="Write a reply..."></textarea>
                    <button type="button" class="reply-submit">Reply</button>
                    <button type="button" class="reply-cancel">Cancel</button>
                `;
                
                link.parentNode.after(replyForm);
                
                // Focus on the textarea
                replyForm.querySelector('.reply-textarea').focus();
                
                // Handle cancel button
                replyForm.querySelector('.reply-cancel').addEventListener('click', () => {
                    replyForm.remove();
                });
                
                // Handle submit button
                replyForm.querySelector('.reply-submit').addEventListener('click', async () => {
                    if (!currentProject || !isWebsim) return;
                    
                    const content = replyForm.querySelector('.reply-textarea').value.trim();
                    if (!content) return;
                    
                    try {
                        const submitBtn = replyForm.querySelector('.reply-submit');
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Posting...';
                        
                        const response = await fetch(`/api/v1/projects/${currentProject.id}/comments`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                content,
                                parent_comment_id: commentId
                            }),
                        });
                        
                        if (!response.ok) {
                            throw new Error(`Failed to post reply: ${response.status}`);
                        }
                        
                        // Reload comments to show the new reply
                        await loadComments(currentProject.id);
                        
                    } catch (error) {
                        console.error('Error posting reply:', error);
                        alert(`Error posting reply: ${error.message}`);
                    }
                });
            });
        });
    }

    // Use demo data when not running in Websim
    function useDemoData() {
        const demoProject = {
            id: 'demo-project-123',
            title: 'Demo Project',
            description: 'This is a demo project for testing the comments system'
        };
        
        displayProjectInfo(demoProject);
        
        const demoComments = {
            comments: {
                data: [
                    {
                        cursor: 'cursor1',
                        comment: {
                            id: 'comment1',
                            project_id: 'demo-project-123',
                            parent_comment_id: null,
                            created_at: new Date(Date.now() - 3600000).toISOString(),
                            raw_content: 'This is a demo comment!',
                            content: {
                                type: 'document',
                                children: [
                                    {
                                        type: 'paragraph',
                                        children: [
                                            {
                                                type: 'text',
                                                text: 'This is a demo comment!'
                                            }
                                        ]
                                    }
                                ]
                            },
                            author: {
                                id: 'user1',
                                username: 'demouser',
                                avatar_url: null
                            },
                            reply_count: 1,
                            deleted: false,
                            pinned: true,
                            pinned_by: {
                                id: 'admin1',
                                username: 'admin',
                                avatar_url: null
                            },
                            reactions: [
                                {
                                    emoji: { name: '👍' },
                                    count: 3,
                                    me: true
                                },
                                {
                                    emoji: { name: '❤️' },
                                    count: 1,
                                    me: false
                                }
                            ]
                        }
                    },
                    {
                        cursor: 'cursor2',
                        comment: {
                            id: 'comment2',
                            project_id: 'demo-project-123',
                            parent_comment_id: 'comment1',
                            created_at: new Date(Date.now() - 1800000).toISOString(),
                            raw_content: 'This is a reply to the first comment!',
                            content: {
                                type: 'document',
                                children: [
                                    {
                                        type: 'paragraph',
                                        children: [
                                            {
                                                type: 'text',
                                                text: 'This is a reply to the first comment!'
                                            }
                                        ]
                                    }
                                ]
                            },
                            author: {
                                id: 'user2',
                                username: 'replier',
                                avatar_url: null
                            },
                            reply_count: 0,
                            deleted: false,
                            pinned: false,
                            pinned_by: null,
                            reactions: []
                        }
                    },
                    {
                        cursor: 'cursor3',
                        comment: {
                            id: 'comment3',
                            project_id: 'demo-project-123',
                            parent_comment_id: null,
                            created_at: new Date(Date.now() - 900000).toISOString(),
                            raw_content: null,
                            content: {
                                type: 'document',
                                children: [
                                    {
                                        type: 'paragraph',
                                        children: [
                                            {
                                                type: 'text',
                                                text: 'Another demo comment with ',
                                            },
                                            {
                                                type: 'text',
                                                text: 'formatting',
                                                bold: true
                                            },
                                            {
                                                type: 'text',
                                                text: ' and a '
                                            },
                                            {
                                                type: 'link',
                                                url: 'https://example.com',
                                                children: [
                                                    {
                                                        type: 'text',
                                                        text: 'link'
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            },
                            author: {
                                id: 'user3',
                                username: 'formatter',
                                avatar_url: null
                            },
                            reply_count: 0,
                            deleted: false,
                            pinned: false,
                            pinned_by: null,
                            reactions: [
                                {
                                    emoji: { name: '🎉' },
                                    count: 2,
                                    me: false
                                }
                            ]
                        }
                    }
                ]
            }
        };
        
        renderComments(demoComments.comments.data);
        
        // Setup form for demo mode
        const commentForm = document.getElementById('comment-form');
        commentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Comment submission is not available in demo mode');
        });
    }
});

