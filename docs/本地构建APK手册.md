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

## 六、下次构建的标准流程（给新对话的 AI）

```bash
# 1. 体检（换机器时核对第一节表格）
node --version; java -version; echo $ANDROID_HOME

# 2. 确认 client/metro.config.js 已含 monorepo 配置（watchFolders + nodeModulesPaths）
#    本仓库已加好；换机器/重置后若没有，按第三节第 1 步补上

# 3. 构建（git bash，子 shell，带环境变量，后台跑）
(cd /d/HouseApp/housemanagement/client/android && EXPO_NO_METRO_WORKSPACE_ROOT=1 ./gradlew assembleRelease --no-daemon)

# 4. 取产物
#    client/android/app/build/outputs/apk/release/app-release.apk
```

**禁忌**：
- ① 别用 `cmd.exe //c "gradlew.bat ..."`，只用 `./gradlew`；
- ② 别漏 `EXPO_NO_METRO_WORKSPACE_ROOT=1`，否则卡在 JS bundle 找不到 entry.js。

---

## 七、本地构建 vs EAS / 热更新 的取舍

| 场景 | 用什么 |
|---|---|
| 改了原生依赖/SDK/app.config 插件 | 本地 `assembleRelease`（本手册）或 `eas build` |
| 改了纯 JS/TS | EAS 热更新 `eas update --branch preview`（见 `热更新与服务端更新手册.md`） |
| 服务端代码改动 | 本机 build + 重启（见 `热更新与服务端更新手册.md`） |
