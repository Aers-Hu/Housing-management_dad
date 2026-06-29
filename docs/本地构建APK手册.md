# 本地构建 APK 手册

> 本文档写给**主库管理员（昴君）**与协作的 AI：如何在**这台 Windows 电脑本地**把手机端（`client/`）打包成 Android APK，**不依赖 EAS 云端**。
>
> **当前状态：✅ 已实测跑通。** 2026-06-29 成功本地打出 `app-release.apk`（约 50M）。关键是两步：① `client/metro.config.js` 加 monorepo 配置；② 构建时带环境变量 `EXPO_NO_METRO_WORKSPACE_ROOT=1`。详见第三节。

---

## 一、环境体检结论（工具链已就绪 ✅）

下表是本机实测环境，**打包所需工具全部满足，无需安装任何东西**：

| 项目 | 实测值 | 状态 |
|---|---|---|
| Node | v24.13.0 | ✅ |
| JDK | **17.0.19**（Temurin），`JAVA_HOME` 已设 | ✅ RN 0.81 需要 JDK 17 |
| ANDROID_HOME | `D:\Android\Sdk` | ✅ |
| SDK build-tools | 35.0.0 / 36.0.0 / 36.1.0 / 37.0.0 | ✅ |
| SDK platforms | android-36 / android-36.1 | ✅（Expo SDK 54 默认 compileSdk 36） |
| platform-tools / NDK 27.x / cmake | 存在 | ✅ |
| `client/android/` 原生工程 | 已存在 | ✅ 不必 prebuild |
| `client/android/local.properties` | `sdk.dir=D:\\Android\\Sdk` | ✅ |
| `client/android/app/debug.keystore` | 存在 | ✅ release 用它签名 |
| Gradle wrapper | 8.14.3（腾讯云镜像） | ✅ |
| `D:\tmp` | 存在 | ✅（`_JAVA_OPTIONS` 指向它） |

---

## 二、两个关键坑

### 坑 1：git bash 里别用 `cmd.exe //c "gradlew.bat ..."`

报错（GBK 乱码）：`'gradlew.bat' 不是内部或外部命令`。
原因：git bash 下 `cmd.exe //c` 启动的 cmd 没继承工作目录、命令串被二次解析破坏。

**解法**：git bash 本身是 sh 环境，直接跑 sh 版 `./gradlew`（无 .bat），用子 shell 切目录。

### 坑 2（致命）：monorepo 下 Metro 找不到 `expo-router/entry.js`

构建走到 `:app:createBundleReleaseJsAndAssets` 然后 FAILED：

```
Error: Unable to resolve module ./../node_modules/expo-router/entry.js
       from D:\HouseApp\housemanagement/.
```

**根因链**：
1. 本仓库是 **pnpm workspace**（`pnpm-workspace.yaml` 里 packages = client, server）。
2. pnpm 把 `expo`、`expo-router` 等依赖 **hoist 到仓库根** `node_modules`；`client/node_modules` 几乎是空的。
3. `@expo/cli` 的 `export:embed` 通过 `getMetroServerRoot()`（`@expo/config/build/paths/paths.js:155`）**自动探测 monorepo 根，把 Metro 的 server root 设成了仓库根**。
4. 但 entry 相对路径是以 `client/` 为基准算的（`../node_modules/expo-router/entry.js`）。server root（仓库根）与 entry 基准（client）**错位一级**，于是 `../` 多跳到 `D:\HouseApp` → 扑空。

**为什么 EAS 云端能打**：EAS 的依赖安装会把依赖放进 `client/node_modules`，不触发此错位。

---

## 三、解法（✅ 已验证）

### 第 1 步：`client/metro.config.js` 加 monorepo 配置

在 `getDefaultConfig(__dirname)` 之后加（已写入仓库，无需重复加）：

```js
const path = require('path');
const workspaceRoot = path.resolve(__dirname, '..');   // 仓库根
config.watchFolders = [...(config.watchFolders || []), workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
```

> 注意：**不要**加 `disableHierarchicalLookup`，pnpm 结构下会有害。

### 第 2 步（关键）：构建时设环境变量 `EXPO_NO_METRO_WORKSPACE_ROOT=1`

源码 `getMetroServerRoot()` 逻辑：

```js
function getMetroServerRoot(projectRoot) {
  if (env.EXPO_NO_METRO_WORKSPACE_ROOT) return projectRoot;        // 设了就用 client，不再上探
  return resolveWorkspaceRoot(projectRoot) ?? projectRoot;          // 默认探测到仓库根（错位元凶）
}
```

设 `EXPO_NO_METRO_WORKSPACE_ROOT=1` 后，Metro server root 回到 `client/`，entry 相对路径 `../node_modules/...` 正好命中仓库根的 node_modules（client 的上级就是仓库根），基准一致，bundle 成功。配合第 1 步的 `watchFolders`/`nodeModulesPaths` 让 Metro 能读到仓库根的依赖。

---

## 四、构建命令与产物（✅ 实测可用）

```bash
# git bash，子 shell，带环境变量，后台跑（首次约 5 分钟）
(cd /d/HouseApp/housemanagement/client/android && EXPO_NO_METRO_WORKSPACE_ROOT=1 ./gradlew assembleRelease --no-daemon)
```

- **产物**：`client/android/app/build/outputs/apk/release/app-release.apk`（实测约 50M）
- **验证**：日志出现 `BUILD SUCCESSFUL`，且：
  ```bash
  ls -lh /d/HouseApp/housemanagement/client/android/app/build/outputs/apk/release/app-release.apk
  ```
- debug 包：把 `assembleRelease` 换成 `assembleDebug` → `.../apk/debug/app-debug.apk`

---

## 五、几个重要决定（为什么这么做）

1. **不跑 `expo prebuild`**：`client/android/` 已存在且含手动定制（如 Android 正式版允许明文 HTTP `usesCleartextTraffic`），重新 prebuild 可能覆盖，有风险。
2. **release 用 debug.keystore 签名**：`app/build.gradle` 的 `release` buildType 配的是 `signingConfig signingConfigs.debug`，无需额外配 keystore，打出的 release APK 自用测试足够（非上架）。
3. **只打 arm64-v8a**：`gradle.properties` 里 `reactNativeArchitectures=arm64-v8a`，体积小、覆盖主流手机。
4. **环境变量只在构建时临时设**，未写进 gradle.properties，避免影响 `expo start` 开发与 EAS 云端构建。

---

## 六、让本地 APK 能收热更新（注入 preview channel）⭐ 已验证

**背景**：EAS 云端构建会自动从 `eas.json` 把 `channel: preview` 写进 APK 的 `AndroidManifest`；本地 `gradlew` 构建**没有这一步**，所以默认打出的本地 APK **不带 channel，收不到 `preview` 的热更新**。下面的配置已写入本仓库的 `client/android/`，**未来直接构建即带 channel，无需重做**。换机器/重置 android 工程后才需按此重新注入。

### 配置内容（已在仓库里）

**① `client/android/app/src/main/res/values/strings.xml`** 加一行（双引号必须用反斜杠转义 `\"`，**不能用 `&quot;`**，否则被 aapt 当 quoting 吃掉，JSON 失效）：

```xml
<string name="expo_updates_request_headers" translatable="false">{\"expo-channel-name\":\"preview\"}</string>
```

**② `client/android/app/src/main/AndroidManifest.xml`** 在 updates 的 meta-data 区（`EXPO_RUNTIME_VERSION` 那条后）加：

```xml
<meta-data android:name="expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY" android:value="@string/expo_updates_request_headers"/>
```

> meta-data key `expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY` 来自 expo-updates android 源码，是它读 channel 的标准入口。

### 验证 channel 真写进 APK（务必做，别只看构建成功）

重新 `assembleRelease` 后，用 aapt2 解出字符串实际值，**必须是带双引号的合法 JSON**：

```bash
AAPT="D:/Android/Sdk/build-tools/36.1.0/aapt2.exe"
"$AAPT" dump resources client/android/app/build/outputs/apk/release/app-release.apk 2>/dev/null \
  | grep -A1 'expo_updates_request_headers'
# 期望输出： "{"expo-channel-name":"preview"}"   ← 双引号在
# 若输出   "{expo-channel-name:preview}"        ← 双引号被吃，错！改用 \" 转义
```

> ⚠️ 实测踩坑：最初用 `&quot;` 实体，解出来变成无引号的 `{expo-channel-name:preview}`（非法 JSON），channel 失效。改用 `\"` 反斜杠转义后才正确。**所以改完一定要解包验证，不能只看 BUILD SUCCESSFUL。**

---

## 七、如何测试热更新功能

前提：手机装的 APK 必须 ① 绑定了 `preview` channel（EAS preview 包天生有；本地包需按第六节注入）② runtimeVersion 与热更新一致（都是 `1.0.0`）。

测试步骤：

1. **装好带 channel 的 APK**（本地包之间同 debug 签名可覆盖安装；本地包↔EAS 包签名不同，须先卸载，会丢 App 内数据如服务器地址/登录态）。
2. 打开 App 跑一次（让它记录当前 bundle）。
3. 在电脑改一处**明显可见**的 JS（例如某界面文字），推热更新：
   ```bash
   cd client && npx eas-cli update --branch preview --message "测试热更新" --non-interactive
   ```
4. **彻底退出 App**（后台划掉）→ **冷启动**：此时后台静默下载新 bundle（`checkAutomatically: ON_LOAD` 是"本次下载、下次生效"）。
5. **再彻底退出一次 → 再冷启动**：应看到第 3 步改的内容已变。变了 = 热更新链路通。
6. 排查：若一直不变，依次确认——APK 是否带 channel（第六节验证）、runtimeVersion 是否都 1.0.0、`eas update` 是否推到 `preview`、手机能否联网到 `u.expo.dev`。

> 想要更直观，可临时在某页加一行带版本号/时间戳的小字，推上去对比。

---

## 八、下次构建的标准流程（给新对话的 AI）

```bash
# 1. 体检（换机器时核对第一节表格）
node --version; java -version; echo $ANDROID_HOME

# 2. 确认两项配置已在仓库（本仓库均已加好；换机器/重置后才需补）
#    - client/metro.config.js 含 monorepo 配置（watchFolders + nodeModulesPaths）—— 第三节
#    - android channel 注入（strings.xml + AndroidManifest）—— 第六节

# 3. 构建（git bash，子 shell，带环境变量，后台跑）
(cd /d/HouseApp/housemanagement/client/android && EXPO_NO_METRO_WORKSPACE_ROOT=1 ./gradlew assembleRelease --no-daemon)

# 4. 取产物 + 验证 channel
#    client/android/app/build/outputs/apk/release/app-release.apk
#    用第六节的 aapt2 命令确认 channel 为合法 JSON
```

**禁忌**：
- ① 别用 `cmd.exe //c "gradlew.bat ..."`，只用 `./gradlew`；
- ② 别漏 `EXPO_NO_METRO_WORKSPACE_ROOT=1`，否则卡在 JS bundle 找不到 entry.js；
- ③ channel JSON 的双引号别用 `&quot;`，用 `\"`。

---

## 九、本地构建 vs EAS / 热更新 的取舍

| 场景 | 用什么 |
|---|---|
| 改了原生依赖/SDK/app.config 插件 | 本地 `assembleRelease`（本手册）或 `eas build` |
| 改了纯 JS/TS | EAS 热更新 `eas update --branch preview`（见 `热更新与服务端更新手册.md`） |
| 服务端代码改动 | 本机 build + 重启（见 `热更新与服务端更新手册.md`） |
