/**
 * FIFO queue of approved posts ready to publish (manual or future auto).
 */
const { getQueuedPosts, enqueuePost, dequeuePost } = require("./contentStore");

function queuePost(postId) {
  return enqueuePost(postId);
}

function getQueue() {
  return getQueuedPosts();
}

function dequeuePostPublic() {
  return dequeuePost();
}

module.exports = {
  queuePost,
  getQueue,
  dequeuePost: dequeuePostPublic,
};
