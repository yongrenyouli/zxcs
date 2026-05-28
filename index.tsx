import {
  Script,
  Navigation,
  NavigationStack,
  List,
  Section,
  Button,
  Text,
  VStack,
  HStack,
  Spacer,
  Image,
  ProgressView,
  useState,
  useEffect
} from "scripting";

// Declare global alert function to satisfy TypeScript compiler
declare const alert: (options: { title?: string; message: string; buttonLabel?: string }) => Promise<void>;

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
  // We need to first ensure we are on the zxcstxt domain
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

function MainView() {
  const dismiss = Navigation.useDismiss();
  
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [points, setPoints] = useState("0");
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [statusMessage, setStatusMessage] = useState("正在查询登录状态...");
  const [checkingIn, setCheckingIn] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");

  // Initialize and refresh user login and check-in status
  const refreshStatus = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setStatusMessage("正在更新数据...");
    }
    const webView = new WebViewController();
    try {
      const info = await checkStatus(webView);
      if (info && info.isLoggedIn) {
        setIsLoggedIn(true);
        setUsername(info.username || "");
        setPoints(info.points || "0");
        setIsCheckedIn(!!info.isCheckedIn);
        setAvatarUrl(info.avatarUrl || "");
        setStatusMessage(info.isCheckedIn ? "今天已成功签到！" : "就绪，可以开始签到");
      } else {
        setIsLoggedIn(false);
        setAvatarUrl("");
        setStatusMessage("登录已失效或未登录，请先登录");
      }
    } catch (err) {
      setStatusMessage("获取状态失败: " + err);
    } finally {
      setLoading(false);
      webView.dispose();
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  // Handle Login flow
  const handleLogin = async () => {
    setLoading(true);
    setStatusMessage("正在准备登录页面...");
    const webView = new WebViewController();
    try {
      // Load login page
      await webView.loadURL("https://www.zxcstxt.com/user-sign?tab=signin&redirect_to=https%3A%2F%2Fwww.zxcstxt.com%2Fuser%2F");
      setStatusMessage("请在弹出的页面中完成登录...");
      
      // Present the login WebView so the user can interactively log in
      await webView.present({
        fullscreen: false,
        navigationTitle: "登录知轩藏书"
      });
      
      // When the presented WebView is dismissed, we re-check the status!
      setStatusMessage("正在更新登录状态...");
      const info = await checkStatus(webView);
      if (info && info.isLoggedIn) {
        setIsLoggedIn(true);
        setUsername(info.username || "");
        setPoints(info.points || "0");
        setIsCheckedIn(!!info.isCheckedIn);
        setAvatarUrl(info.avatarUrl || "");
        setStatusMessage(info.isCheckedIn ? "今天已成功签到！" : "就绪，可以开始签到");
        await alert({
          title: "登录成功",
          message: `欢迎回来，${info.username}！`
        });
      } else {
        setIsLoggedIn(false);
        setAvatarUrl("");
        setStatusMessage("未检测到登录状态，请重试");
      }
    } catch (err) {
      setStatusMessage("登录页面加载失败: " + err);
    } finally {
      setLoading(false);
      webView.dispose();
    }
  };

  // Handle Check-in flow
  const handleCheckIn = async () => {
    if (checkingIn || isCheckedIn) return;
    setCheckingIn(true);
    setStatusMessage("正在执行签到，请稍后...");
    const webView = new WebViewController();
    try {
      const res = await performCheckIn(webView);
      if (res && res.error === false) {
        setIsCheckedIn(true);
        setStatusMessage("签到成功！");
        await alert({
          title: "签到成功",
          message: res.msg || "今日签到成功！"
        });
        // Refresh balance to update points
        await refreshStatus(true);
      } else if (res && res.msg === "今日已签到") {
        setIsCheckedIn(true);
        setStatusMessage("今日已签到！");
        await alert({
          title: "提示",
          message: "您今天已经签到过了哦，请明天再来！"
        });
        await refreshStatus(true);
      } else {
        await alert({
          title: "签到失败",
          message: res.msg || "签到接口返回错误，请尝试重新登录！"
        });
        setStatusMessage(res.msg || "签到失败，请尝试重新登录");
      }
    } catch (err) {
      await alert({
        title: "请求出错",
        message: "网络请求异常，请检查网络！"
      });
      setStatusMessage("签到出错: " + err);
    } finally {
      setCheckingIn(false);
      webView.dispose();
    }
  };

  // Logout/Switch account flow
  const handleLogout = async () => {
    setLoading(true);
    setStatusMessage("正在注销登录...");
    const webView = new WebViewController();
    try {
      // Load logout trigger page (standard WordPress logout or we can just load the sign-in modal/page to let user log out)
      await webView.loadURL("https://www.zxcstxt.com/wp-login.php?action=logout");
      // Give a brief moment or we can present it to let them click logout confirmation
      await webView.present({
        fullscreen: false,
        navigationTitle: "切换/退出账号"
      });
      
      setStatusMessage("正在检查登录状态...");
      const info = await checkStatus(webView);
      if (info && info.isLoggedIn) {
        setIsLoggedIn(true);
        setUsername(info.username || "");
        setPoints(info.points || "0");
        setIsCheckedIn(!!info.isCheckedIn);
        setAvatarUrl(info.avatarUrl || "");
        setStatusMessage("仍处于登录状态");
      } else {
        setIsLoggedIn(false);
        setUsername("");
        setPoints("0");
        setIsCheckedIn(false);
        setAvatarUrl("");
        setStatusMessage("已退出登录");
        await alert({
          title: "已退出",
          message: "您已成功退出登录，安全退出！"
        });
      }
    } catch (err) {
      setStatusMessage("注销失败: " + err);
    } finally {
      setLoading(false);
      webView.dispose();
    }
  };

  return (
    <NavigationStack>
      <List
        navigationTitle="知轩藏书签到"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: <Button title="关闭" action={dismiss} />
        }}
      >
        {loading ? (
          <Section>
            <VStack spacing={16} padding={{ top: 30, bottom: 30 }} alignment="center">
              <ProgressView />
              <Text font="subheadline" foregroundStyle="gray">
                {statusMessage}
              </Text>
            </VStack>
          </Section>
        ) : !isLoggedIn ? (
          <Section>
            <VStack spacing={20} padding={{ top: 30, bottom: 30 }} alignment="center">
              <Image
                systemName="person.crop.circle.badge.questionmark"
                frame={{ width: 70, height: 70 }}
                foregroundStyle="orange"
              />
              <VStack spacing={6} alignment="center">
                <Text font="title3" bold={true}>
                  尚未登录
                </Text>
                <Text font="footnote" foregroundStyle="gray">
                  {statusMessage}
                </Text>
              </VStack>
              <Button
                title="登录知轩藏书"
                systemImage="lock.shield"
                action={handleLogin}
              />
            </VStack>
          </Section>
        ) : (
          <>
            {/* User Profile Card */}
            <Section>
              <HStack spacing={16} padding={{ vertical: 10 }}>
                {avatarUrl ? (
                  <Image
                    imageUrl={avatarUrl}
                    frame={{ width: 50, height: 50 }}
                    clipShape="circle"
                    placeholder={
                      <Image
                        systemName="person.crop.circle.fill"
                        frame={{ width: 50, height: 50 }}
                        foregroundStyle="green"
                      />
                    }
                  />
                ) : (
                  <Image
                    systemName="person.crop.circle.fill"
                    frame={{ width: 50, height: 50 }}
                    foregroundStyle="green"
                  />
                )}
                <VStack spacing={4} alignment="leading">
                  <Text font="headline" bold={true}>
                    {username}
                  </Text>
                  <Text font="caption" foregroundStyle="gray">
                    知轩藏书会员
                  </Text>
                </VStack>
                <Spacer />
                <Button
                  title="刷新"
                  systemImage="arrow.clockwise"
                  action={() => refreshStatus(true)}
                />
              </HStack>
            </Section>

            {/* Account Info list */}
            <Section title="账户与积分信息">
              <HStack spacing={12}>
                <Image
                  systemName="sparkles"
                  frame={{ width: 20, height: 20 }}
                  foregroundStyle="yellow"
                />
                <Text>积分余额</Text>
                <Spacer />
                <Text bold={true} foregroundStyle="orange">
                  {points} 积分
                </Text>
              </HStack>
              <HStack spacing={12}>
                <Image
                  systemName={isCheckedIn ? "checkmark.circle.fill" : "circle"}
                  frame={{ width: 20, height: 20 }}
                  foregroundStyle={isCheckedIn ? "green" : "gray"}
                />
                <Text>今日签到状态</Text>
                <Spacer />
                <Text bold={true} foregroundStyle={isCheckedIn ? "green" : "red"}>
                  {isCheckedIn ? "已签到" : "未签到"}
                </Text>
              </HStack>
            </Section>

            {/* Check-in actions */}
            <Section title="签到操作">
              {isCheckedIn ? (
                <HStack spacing={12} padding={{ vertical: 6 }}>
                  <Image
                    systemName="checkmark.seal.fill"
                    frame={{ width: 24, height: 24 }}
                    foregroundStyle="green"
                  />
                  <VStack alignment="leading" spacing={2}>
                    <Text bold={true} foregroundStyle="green">
                      今天已经签到成功啦！
                    </Text>
                    <Text font="caption2" foregroundStyle="gray">
                      积分已发放到您的账户，明天再来签到吧
                    </Text>
                  </VStack>
                </HStack>
              ) : (
                <VStack spacing={12} padding={{ vertical: 8 }} alignment="center">
                  <Button
                    title={checkingIn ? "正在签到..." : "一键每日签到"}
                    systemImage="calendar.badge.clock"
                    action={handleCheckIn}
                    disabled={checkingIn}
                  />
                  <Text font="caption2" foregroundStyle="gray">
                    一键发送签到请求，轻松赚取每日积分
                  </Text>
                </VStack>
              )}
            </Section>

            {/* Switch Account */}
            <Section>
              <Button
                title="切换账号 / 安全退出"
                role="destructive"
                action={handleLogout}
              />
            </Section>
          </>
        )}
      </List>
    </NavigationStack>
  );
}

async function run() {
  await Navigation.present(<MainView />);
  Script.exit();
}

run();
