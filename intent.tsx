import {
  Script,
  Intent,
  Notification
} from "scripting";

// Parse user login status, username, points, and check-in state
async function checkStatus(webView: WebViewController) {
  await webView.loadURL("https://www.zxcstxt.com/user/balance");
  await webView.waitForLoad();
  
  const info = await webView.evaluateJavaScript(`
    return (() => {
      const isLoggedIn = document.body.classList.contains('logged-in') || !!document.querySelector('.display-name');
      if (!isLoggedIn) {
        return { isLoggedIn: false };
      }
      
      const nameEl = document.querySelector('.display-name');
      const username = nameEl ? nameEl.textContent.trim() : 'Unknown';
      
      const pointsEl = document.querySelector('.em3x');
      const points = pointsEl ? pointsEl.textContent.trim() : '0';
      
      const isCheckedIn = document.body.innerText.includes('今日已签到') || document.body.innerText.includes('已签到');
      
      const avatarEl = document.querySelector('.avatar-img img.avatar') || document.querySelector('.avatar-img img') || document.querySelector('img.avatar');
      let avatarUrl = '';
      if (avatarEl) {
        avatarUrl = avatarEl.getAttribute('data-src') || avatarEl.getAttribute('src') || '';
        if (avatarUrl && !avatarUrl.startsWith('http')) {
          avatarUrl = window.location.origin + avatarUrl;
        }
      }
      
      return {
        isLoggedIn: true,
        username,
        points,
        isCheckedIn,
        avatarUrl
      };
    })()
  `);
  return info;
}

// Perform AJAX check-in request inside the WebView context
async function performCheckIn(webView: WebViewController) {
  await webView.loadURL("https://www.zxcstxt.com/user/");
  await webView.waitForLoad();
  
  const resultStr = await webView.evaluateJavaScript(`
    return (async () => {
      try {
        const res = await fetch('/wp-admin/admin-ajax.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          },
          body: 'action=user_checkin'
        });
        const data = await res.json();
        return JSON.stringify(data);
      } catch (err) {
        return 'Error: ' + err.toString();
      }
    })()
  `);
  
  try {
    return JSON.parse(resultStr);
  } catch (e) {
    return { error: true, msg: "解析签到结果失败，请稍后重试" };
  }
}

async function run() {
  const webView = new WebViewController();
  try {
    // 1. Check login state
    const info = await checkStatus(webView);
    if (!info || !info.isLoggedIn) {
      // Not logged in or expired
      const message = "登录状态已失效，请点击此通知打开应用重新登录！";
      await Notification.schedule({
        title: "知轩藏书自动签到失败",
        body: message,
        iconImageData: {
          systemImage: "lock.shield",
          color: "red"
        }
      });
      Script.exit(Intent.text("知轩藏书自动签到失败：" + message));
      return;
    }

    // 2. Already checked in?
    if (info.isCheckedIn) {
      const message = `您今天已经签到过了。用户：${info.username}，当前积分：${info.points}。`;
      await Notification.schedule({
        title: "知轩藏书已签到",
        body: message,
        iconImageData: {
          systemImage: "checkmark.circle.fill",
          color: "gray"
        }
      });
      Script.exit(Intent.text("知轩藏书自动签到结果：" + message));
      return;
    }

    // 3. Perform check-in
    const res = await performCheckIn(webView);
    if (res && (res.error === false || res.msg === "今日已签到")) {
      // Re-fetch balance to get updated points
      const updatedInfo = await checkStatus(webView);
      const pointsStr = updatedInfo && updatedInfo.points ? updatedInfo.points : info.points;
      const successMsg = `签到成功！用户：${info.username}，最新积分：${pointsStr}。`;
      
      await Notification.schedule({
        title: "知轩藏书自动签到成功",
        body: successMsg,
        iconImageData: {
          systemImage: "sparkles",
          color: "orange"
        }
      });
      Script.exit(Intent.text("知轩藏书自动签到成功：" + successMsg));
    } else {
      const failMsg = `接口报错：${res?.msg || "网络请求失败"}`;
      await Notification.schedule({
        title: "知轩藏书自动签到失败",
        body: failMsg,
        iconImageData: {
          systemImage: "exclamationmark.triangle.fill",
          color: "red"
        }
      });
      Script.exit(Intent.text("知轩藏书自动签到失败：" + failMsg));
    }
  } catch (err) {
    const errorMsg = `发生异常：${err}`;
    await Notification.schedule({
      title: "知轩藏书自动签到出错",
      body: errorMsg,
      iconImageData: {
        systemImage: "xmark.octagon.fill",
        color: "red"
      }
    });
    Script.exit(Intent.text("知轩藏书自动签到出错：" + errorMsg));
  } finally {
    webView.dispose();
  }
}

run();
