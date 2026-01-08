// Initialize alarm on install
chrome.runtime.onInstalled.addListener(() => {
  log('扩展已安装/更新');
  chrome.storage.local.get(['checkInterval'], (result) => {
    const interval = result.checkInterval || 15;
    chrome.alarms.create('checkPosts', { periodInMinutes: interval });
  });
});

// Handle alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  log(`定时任务触发: ${alarm.name}`);
  if (alarm.name === 'checkPosts') {
    checkAllAccounts();
  }
});

let activeTabId = null;
let activeCheckResolve = null;

// Handle messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_NOW') {
    log('手动检查触发');
    checkAllAccounts();
  }
  if (message.type === 'UPDATE_ALARM') {
    chrome.alarms.clear('checkPosts', () => {
      chrome.alarms.create('checkPosts', { periodInMinutes: message.interval });
      log(`定时任务已更新。新间隔: ${message.interval} 分钟`);
    });
  }
  
  // Handle results from content script
  if (message.type === 'FOUND_POSTS' || message.type === 'NO_POSTS') {
    // Only process if it comes from the tab we are actively checking
    if (activeTabId && sender.tab && sender.tab.id === activeTabId) {
       if (activeCheckResolve) {
         const posts = message.posts || [];
         if (message.type === 'NO_POSTS') {
            log(`内容脚本未在 ${message.username} 找到帖子`);
         } else {
            log(`内容脚本在 ${message.username} 找到 ${posts.length} 个帖子`);
         }
         
         // Resolve the promise to let checkAllAccounts continue
         activeCheckResolve(posts);
         
         // Clean up will be done by the caller (checkAllAccounts -> checkAccountWithTab)
       }
    }
  }
});

async function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${message}`;
  console.log(logEntry);

  const data = await chrome.storage.local.get(['logs']);
  const logs = data.logs || [];
  
  // Keep last 100 logs
  if (logs.length >= 100) {
    logs.shift();
  }
  
  logs.push(logEntry);
  await chrome.storage.local.set({ logs });
}

let isChecking = false;

async function checkAllAccounts() {
  if (isChecking) {
    log('检查正在进行中，跳过。');
    return;
  }
  isChecking = true;

  try {
    const data = await chrome.storage.local.get(['accounts', 'webhookUrl']);
    const accounts = data.accounts || [];
    const webhookUrl = data.webhookUrl;

    if (accounts.length === 0) {
        log('没有账号需要检查。');
        isChecking = false;
        return;
    }

    log(`正在检查 ${accounts.length} 个账号...`);

    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        if (!acc.knownPosts) {
            acc.knownPosts = [];
        }

        try {
            // Open tab and wait for results
            const foundPosts = await checkAccountWithTab(acc.username);
            
            // Identify new posts for webhooks
            const newPosts = foundPosts.filter(p => !acc.knownPosts.includes(p.shortcode));
            
            if (newPosts.length > 0) {
                log(`在 ${acc.username} 发现 ${newPosts.length} 个新帖子`);
                
                for (const post of newPosts) {
                    log(`新帖子: ${post.url}`);
                    
                    if (webhookUrl) {
                        log(`发送 Webhook: ${acc.username} 帖子 ${post.shortcode}`);
                        await sendWebhook(webhookUrl, {
                            account: acc.username,
                            newPostUrl: post.url,
                            timestamp: new Date().toISOString()
                        });
                    }

                    // System Notification
                    // Use post URL as notification ID to handle click
                    chrome.notifications.create(post.url, {
                        type: 'basic',
                        iconUrl: 'icons/icon128.png',
                        title: `来自 ${acc.username} 的新帖子`,
                        message: `发现新帖子: ${post.shortcode}`,
                        priority: 2
                    }, (notificationId) => {
                        if (chrome.runtime.lastError) {
                            log(`创建通知错误: ${chrome.runtime.lastError.message}`);
                        } else {
                            log(`通知已创建: ${notificationId}`);
                        }
                    });

                    acc.knownPosts.push(post.shortcode);
                }
                
                if (acc.knownPosts.length > 100) {
                    acc.knownPosts = acc.knownPosts.slice(-100);
                }

                await chrome.storage.local.set({ accounts });
                
            } else {
                if (foundPosts.length > 0) {
                     log(`${acc.username} 没有新帖子。检查了 ${foundPosts.length} 个帖子。`);
                } else {
                     log(`${acc.username} 未找到帖子。`);
                }
            }
        } catch (err) {
            log(`检查 ${acc.username} 出错: ${err.message}`);
        }
        
        // Small delay between accounts
        await new Promise(r => setTimeout(r, 2000));
    }
    log('检查完成。');
  } finally {
    isChecking = false;
  }
}

// Handle notification click
chrome.notifications.onClicked.addListener((notificationId) => {
    // notificationId is the post URL
    if (notificationId && notificationId.startsWith('http')) {
        chrome.tabs.create({ url: notificationId });
    }
});

let helperWindowId = null;

async function getOrCreateHelperWindow() {
    if (helperWindowId) {
        try {
            const win = await chrome.windows.get(helperWindowId);
            if (win) return helperWindowId;
        } catch (e) {
            // Window doesn't exist anymore
            helperWindowId = null;
        }
    }

    return new Promise((resolve) => {
        chrome.windows.create({
            url: 'about:blank',
            focused: false,
            width: 200,
            height: 200,
            type: 'popup'
        }, (win) => {
            if (chrome.runtime.lastError || !win) {
                log(`创建后台窗口失败: ${chrome.runtime.lastError?.message}`);
                resolve(null);
                return;
            }
            helperWindowId = win.id;
            resolve(helperWindowId);
        });
    });
}

function checkAccountWithTab(username) {
  return new Promise(async (resolve, reject) => {
     try {
         const windowId = await getOrCreateHelperWindow();
         const url = `https://www.instagram.com/${username}/`;
         log(`正在为 ${username} 打开标签页...`);
         
         const createProps = { url, active: false };
         if (windowId) {
             createProps.windowId = windowId;
             // If we are using a helper window, we might want to ensure that window itself doesn't steal focus
             // But chrome.tabs.create 'active' refers to the tab within that window.
             // If the window is minimized or not focused, this is fine.
         } else {
             // Fallback to current window, active false
             createProps.active = false;
         }

         chrome.tabs.create(createProps, (tab) => {
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }
            
            activeTabId = tab.id;
            
            // Cleanup function
            const cleanup = () => {
                if (activeTabId === tab.id) {
                    chrome.tabs.remove(tab.id, () => {});
                    activeTabId = null;
                    activeCheckResolve = null;
                }
            };

            // Set the resolver for the message listener
            activeCheckResolve = (posts) => {
                cleanup();
                resolve(posts);
            };
            
            // Safety timeout (e.g. 40s)
            setTimeout(() => {
               if (activeTabId === tab.id) {
                  log(`${username} 等待超时`);
                  cleanup();
                  resolve([]); // Resolve with empty to continue flow
               }
            }, 40000);
         });
     } catch (err) {
         reject(err);
     }
  });
}

async function sendWebhook(url, data) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    log('Webhook sent successfully');
  } catch (err) {
    log(`Webhook failed: ${err.message}`);
  }
}
