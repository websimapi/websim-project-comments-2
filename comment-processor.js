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