document.addEventListener('DOMContentLoaded', () => {
  const accountInput = document.getElementById('accountInput');
  const addBtn = document.getElementById('addBtn');
  const accountList = document.getElementById('accountList');
  const intervalSelect = document.getElementById('intervalSelect');
  const webhookInput = document.getElementById('webhookInput');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const checkNowBtn = document.getElementById('checkNowBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const statusDiv = document.getElementById('status');

  // Load saved data
  chrome.storage.local.get(['accounts', 'checkInterval', 'webhookUrl', 'logs'], (result) => {
    const accounts = result.accounts || [];
    renderAccounts(accounts);
    
    if (result.checkInterval) {
      intervalSelect.value = result.checkInterval;
    }
    if (result.webhookUrl) {
      webhookInput.value = result.webhookUrl;
    }
    if (result.logs) {
      renderLogs(result.logs);
    }
  });

  // Add account
  addBtn.addEventListener('click', () => {
    const username = accountInput.value.trim();
    if (!username) return;

    chrome.storage.local.get(['accounts'], (result) => {
      const accounts = result.accounts || [];
      if (!accounts.some(acc => acc.username === username)) {
        accounts.push({ username: username, lastPostUrl: null });
        chrome.storage.local.set({ accounts }, () => {
          renderAccounts(accounts);
          accountInput.value = '';
          showStatus('账号已添加');
        });
      } else {
        showStatus('账号已存在');
      }
    });
  });

  // Check Now
  checkNowBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CHECK_NOW' });
    showStatus('检查已触发...');
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', () => {
    const interval = parseFloat(intervalSelect.value);
    const webhookUrl = webhookInput.value.trim();

    chrome.storage.local.set({ 
      checkInterval: interval,
      webhookUrl: webhookUrl 
    }, () => {
      // Update alarm
      chrome.runtime.sendMessage({ type: 'UPDATE_ALARM', interval });
      showStatus('设置已保存');
    });
  });

  // Clear Logs
  clearLogsBtn.addEventListener('click', () => {
    chrome.storage.local.set({ logs: [] }, () => {
      renderLogs([]);
      showStatus('日志已清除');
    });
  });

  // Listen for storage changes to update logs
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.logs) {
      const newLogs = changes.logs.newValue || [];
      console.log('Logs updated:', newLogs);
      renderLogs(newLogs);
    }
  });

  function renderAccounts(accounts) {
    accountList.innerHTML = '';
    accounts.forEach((acc, index) => {
      const div = document.createElement('div');
      div.className = 'account-item';
      
      const nameSpan = document.createElement('span');
      const postCount = acc.knownPosts ? acc.knownPosts.length : 0;
      nameSpan.textContent = `${acc.username} (${postCount})`;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '删除';
      removeBtn.onclick = () => removeAccount(index);
      
      const clearPostsBtn = document.createElement('button');
      clearPostsBtn.className = 'remove-btn';
      clearPostsBtn.style.backgroundColor = '#ff9800'; // Orange color for distinction
      clearPostsBtn.style.marginRight = '5px';
      clearPostsBtn.textContent = '清空记录';
      clearPostsBtn.onclick = () => clearAccountPosts(index);

      const btnContainer = document.createElement('div');
      btnContainer.appendChild(clearPostsBtn);
      btnContainer.appendChild(removeBtn);
      
      div.appendChild(nameSpan);
      div.appendChild(btnContainer);
      accountList.appendChild(div);
    });
  }

  function clearAccountPosts(index) {
    chrome.storage.local.get(['accounts'], (result) => {
      const accounts = result.accounts || [];
      if (accounts[index]) {
        accounts[index].knownPosts = [];
        chrome.storage.local.set({ accounts }, () => {
          renderAccounts(accounts);
          showStatus(`${accounts[index].username} 记录已清空`);
        });
      }
    });
  }

  function removeAccount(index) {
    chrome.storage.local.get(['accounts'], (result) => {
      const accounts = result.accounts || [];
      accounts.splice(index, 1);
      chrome.storage.local.set({ accounts }, () => {
        renderAccounts(accounts);
        showStatus('账号已删除');
      });
    });
  }

  function renderLogs(logs) {
    const logPanel = document.getElementById('logPanel');
    if (!logs || logs.length === 0) {
      logPanel.textContent = '暂无日志';
      return;
    }
    // Show newest first
    logPanel.innerHTML = logs.slice().reverse().map(log => `<div>${log}</div>`).join('');
  }

  function showStatus(msg) {
    statusDiv.textContent = msg;
    setTimeout(() => {
      statusDiv.textContent = '';
    }, 2000);
  }
});
