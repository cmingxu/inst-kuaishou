// content.js
console.log('IG Watcher: Content script loaded');

function getUsernameFromUrl() {
  // Url format: https://www.instagram.com/username/
  const path = window.location.pathname;
  const parts = path.split('/').filter(p => p);
  if (parts.length >= 1) {
    return parts[0];
  }
  return null;
}

function findPosts() {
  const username = getUsernameFromUrl();
  if (!username) return [];

  const links = document.querySelectorAll('a');
  console.log(`IG Watcher: Found ${links.length} links on page`);
  
  const posts = [];
  const uniqueShortcodes = new Set();

  // Regex to match /username/p/shortcode/
  // Note: Sometimes hrefs are relative or absolute.
  // href property is always absolute in JS objects, getAttribute is what's in HTML.
  // We'll use the href property.
  
  links.forEach(link => {
    const href = link.href;
    console.log(`IG Watcher: Checking href: ${href}`);
    
    // We are looking for something that contains /p/shortcode/
    // And ideally belongs to the user.
    // On the profile page, links are usually just /p/SHORTCODE/ or /username/p/SHORTCODE/
    
    if (href.includes('/p/')) {
        // Extract shortcode
        // typical: https://www.instagram.com/p/C_xyz123/
        const match = href.match(/\/p\/([A-Za-z0-9_-]+)\//);
        if (match && match[1]) {
            const shortcode = match[1];
            if (!uniqueShortcodes.has(shortcode)) {
                uniqueShortcodes.add(shortcode);
                posts.push({
                    shortcode: shortcode,
                    url: href,
                    timestamp: Date.now() // We can't easily get the real timestamp from href
                });
            }
        }
    }
  });

  return posts;
}

// We need to wait for the page to load dynamic content.
// Start checking after 5 seconds
setTimeout(() => {
  let attempts = 0;
  const maxAttempts = 20; // 20 * 1000ms = 20 seconds max

  const interval = setInterval(() => {
    attempts++;
    const posts = findPosts();
    
    if (posts.length > 0) {
      console.log(`IG Watcher: Found ${posts.length} posts`);
      clearInterval(interval);
      chrome.runtime.sendMessage({
        type: 'FOUND_POSTS',
        username: getUsernameFromUrl(),
        posts: posts
      });
    } else if (attempts >= maxAttempts) {
      console.log('IG Watcher: Timeout - no posts found');
      clearInterval(interval);
      chrome.runtime.sendMessage({
        type: 'NO_POSTS',
        username: getUsernameFromUrl()
      });
    }
  }, 1000);
}, 5000);
