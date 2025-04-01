// Comment processing utilities for the comment system
const room = new WebsimSocket();

// Create or get a processing status record for a comment
async function getCommentProcessingStatus(commentId) {
  // Get existing record if it exists
  const statusRecords = await room.collection('comment_status').filter({ comment_id: commentId }).getList();
  
  // If record exists, return it
  if (statusRecords && statusRecords.length > 0) {
    return statusRecords[0];
  }
  
  // Otherwise create a new record with default "unprocessed" status
  try {
    const newStatus = await room.collection('comment_status').create({
      comment_id: commentId,
      processed: false,
      processed_at: null
    });
    return newStatus;
  } catch (error) {
    console.error('Error creating comment status record:', error);
    return null;
  }
}

// Mark a comment as processed by the LLM
async function markCommentAsProcessed(commentId) {
  // Get existing record
  const statusRecords = await room.collection('comment_status').filter({ comment_id: commentId }).getList();
  
  if (statusRecords && statusRecords.length > 0) {
    // Update existing record
    try {
      await room.collection('comment_status').update(statusRecords[0].id, {
        processed: true,
        processed_at: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error updating comment status:', error);
      return false;
    }
  } else {
    // Create new record with processed status
    try {
      await room.collection('comment_status').create({
        comment_id: commentId,
        processed: true,
        processed_at: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error creating processed comment status:', error);
      return false;
    }
  }
}

// Subscribe to changes in comment status records
function subscribeToCommentStatusChanges(callback) {
  return room.collection('comment_status').subscribe(callback);
}

// Process a comment with the LLM and store the result
async function processCommentWithLLM(commentId, commentContent) {
  try {
    // Check if the comment contains images
    const commentElement = document.querySelector(`.comment[data-comment-id="${commentId}"]`);
    const images = commentElement.querySelectorAll('.comment-content img');
    
    // Prepare message content array (supports text and images)
    let messageContent = [];
    
    // Add the text content
    messageContent.push({
      type: "text",
      text: `Create a small interactive component based on this comment: "${commentContent}". Respond with HTML, CSS, and JavaScript code only.`
    });
    
    // Add any images found in the comment
    if (images.length > 0) {
      for (const img of images) {
        try {
          // Create a canvas to convert the image to a data URL
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          
          // Draw the image to canvas and convert to data URL
          ctx.drawImage(img, 0, 0);
          const imageDataUrl = canvas.toDataURL('image/jpeg');
          
          // Add the image to the message content
          messageContent.push({
            type: "image_url",
            image_url: { url: imageDataUrl }
          });
        } catch (imgError) {
          console.error('Error processing image:', imgError);
        }
      }
    }
    
    // Get the LLM to generate a response with text and images
    const completion = await websim.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that creates interactive UI components based on user comments. Generate HTML, CSS, and JavaScript code that responds to the user's comment and any images they've shared."
        },
        {
          role: "user",
          content: messageContent
        }
      ]
    });
    
    // Store the generated response
    const statusRecords = await room.collection('comment_status').filter({ comment_id: commentId }).getList();
    
    if (statusRecords && statusRecords.length > 0) {
      await room.collection('comment_status').update(statusRecords[0].id, {
        processed: true,
        processed_at: new Date().toISOString(),
        response: completion.content,
        processed_by: window.websim ? (await window.websim.getUser()).username : 'unknown'
      });
    }
    
    return completion.content;
  } catch (error) {
    console.error('Error processing comment with LLM:', error);
    throw error;
  }
}

// Execute LLM-generated code in the container
function executeGeneratedCode(code, containerId) {
  const container = document.getElementById(containerId);
  
  try {
    // Create a container for the generated content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'generated-content';
    
    // Extract HTML, CSS, and JS from the response
    const htmlMatch = code.match(/```html\n([\s\S]*?)\n```/);
    const cssMatch = code.match(/```css\n([\s\S]*?)\n```/);
    const jsMatch = code.match(/```js(?:cript)?\n([\s\S]*?)\n```/);
    
    // Apply HTML
    if (htmlMatch && htmlMatch[1]) {
      contentDiv.innerHTML = htmlMatch[1];
    }
    
    // Apply CSS
    if (cssMatch && cssMatch[1]) {
      const styleEl = document.createElement('style');
      styleEl.textContent = cssMatch[1];
      contentDiv.appendChild(styleEl);
    }
    
    // Apply JS
    if (jsMatch && jsMatch[1]) {
      const scriptEl = document.createElement('script');
      scriptEl.textContent = jsMatch[1];
      // Add a timeout to ensure the HTML is rendered before the script runs
      setTimeout(() => {
        contentDiv.appendChild(scriptEl);
      }, 100);
    }
    
    container.appendChild(contentDiv);
    return true;
  } catch (error) {
    console.error('Error executing generated code:', error);
    return false;
  }
}