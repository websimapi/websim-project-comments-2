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
    // Call the LLM with the comment content
    const completion = await websim.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates interface components based on user comments. Create simple, functional HTML, CSS, and JavaScript that responds to the user's comment. Your response should only contain the code to implement what the user is asking for, wrapped in appropriate HTML, CSS and JS tags. Keep your response concise and focused."
        },
        {
          role: "user",
          content: commentContent
        }
      ]
    });
    
    // Get the generated code from the LLM
    const generatedCode = completion.content;
    
    // Store the result in the database
    const statusRecords = await room.collection('comment_status').filter({ comment_id: commentId }).getList();
    
    // Get the current user
    const currentUser = await window.websim.getUser();
    const processedBy = currentUser ? currentUser.username : 'system';
    
    if (statusRecords && statusRecords.length > 0) {
      // Update existing record
      await room.collection('comment_status').update(statusRecords[0].id, {
        processed: true,
        processed_at: new Date().toISOString(),
        processed_by: processedBy,
        generated_code: generatedCode
      });
    } else {
      // Create new record
      await room.collection('comment_status').create({
        comment_id: commentId,
        processed: true,
        processed_at: new Date().toISOString(),
        processed_by: processedBy,
        generated_code: generatedCode
      });
    }
    
    return generatedCode;
  } catch (error) {
    console.error('Error processing comment with LLM:', error);
    return null;
  }
}

// Get all comment status records with generated code
async function getProcessedComments() {
  try {
    const statusRecords = await room.collection('comment_status').filter({ processed: true }).getList();
    return statusRecords.filter(record => record.generated_code);
  } catch (error) {
    console.error('Error getting processed comments:', error);
    return [];
  }
}

// Execute generated code in the container
function executeGeneratedCode(generatedCode, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  try {
    // Extract HTML, CSS, and JS from the generated code
    const htmlMatch = generatedCode.match(/<html>([\s\S]*?)<\/html>/i);
    const cssMatch = generatedCode.match(/<css>([\s\S]*?)<\/css>/i);
    const jsMatch = generatedCode.match(/<javascript>([\s\S]*?)<\/javascript>/i);
    
    // Create HTML element
    if (htmlMatch && htmlMatch[1]) {
      const htmlContent = htmlMatch[1].trim();
      const div = document.createElement('div');
      div.classList.add('generated-component');
      div.innerHTML = htmlContent;
      container.appendChild(div);
    }
    
    // Create and apply CSS
    if (cssMatch && cssMatch[1]) {
      const cssContent = cssMatch[1].trim();
      const style = document.createElement('style');
      style.textContent = cssContent;
      container.appendChild(style);
    }
    
    // Execute JavaScript
    if (jsMatch && jsMatch[1]) {
      const jsContent = jsMatch[1].trim();
      const script = document.createElement('script');
      script.textContent = jsContent;
      container.appendChild(script);
    }
    
    return true;
  } catch (error) {
    console.error('Error executing generated code:', error);
    return false;
  }
}