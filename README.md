# Instagram Post Watcher Extension

A Chrome extension that monitors Instagram accounts for new posts and sends notifications via a webhook.

## Features

- Watch multiple Instagram accounts.
- Checks for new posts periodically (configurable interval).
- Works in the background (even if the tab is not active).
- Sends a POST request to a webhook URL when a new post is detected.
- Detects the latest post by timestamp (handles pinned posts correctly).

## Installation

1.  Download or clone this repository.
2.  Open Chrome and go to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the folder containing this extension (`inst-kuaishou`).

## Usage

1.  **Login:** Ensure you are logged into `www.instagram.com` in your Chrome browser. The extension uses your existing session cookies.
2.  **Configuration:**
    *   Click the extension icon.
    *   **Add Accounts:** Enter an Instagram username (e.g., `nasa`) and click "Add".
    *   **Webhook URL:** Enter the URL of your server endpoint that will receive notifications.
    *   **Interval:** Set how often to check (in minutes).
    *   Click "Save Settings".
3.  **Notifications:**
    When a new post is found, the extension will send a POST request to your webhook URL with the following JSON body:
    ```json
    {
      "account": "username",
      "newPostUrl": "https://www.instagram.com/p/C_xyz123/",
      "timestamp": "2024-01-01T12:00:00.000Z"
    }
    ```

## Troubleshooting

- **Not working?** Check the extension errors in `chrome://extensions/`.
- **Logged out?** If you are logged out of Instagram, the extension will stop working. Log in again and it should resume.
- **Console Logs:** You can view the background script logs by clicking "service worker" in the extension card in `chrome://extensions/`.
# inst-kuaishou
