# 随身 Dev-C++（iPad 版 C/C++ 练习工具）

在 iPad 上写 C / C++ 的网页 App：语法高亮、行号、自动缩进、一键运行、看输出、报错定位到行、代码自动保存。
添加到主屏幕后和普通 App 一样，**第一次打开之后断网也能用**。

- 免费，不上架 App Store，不需要装任何东西
- 纯前端，代码只存在你自己的设备上
- 两套主题：经典 Dev-C++ 浅色 / 现代深色

---

## 一、先在本机看一眼（1 分钟）

双击 `tools/serve.cmd`，会自动打开 `http://localhost:8080`。
iPad 想连电脑预览的话，看窗口里打印的局域网地址（要同一个 WiFi）。

---

## 二、装到 iPad 上（推荐：GitHub Pages，免费）

### 第 1 步：把文件传到 GitHub（电脑上操作，约 10 分钟）

1. 打开 <https://github.com>，注册 / 登录（免费）
2. 右上角 `+` → **New repository**
   - Repository name 填 `pocket-devcpp`
   - 选 **Public**
   - 点 **Create repository**
3. 在新仓库页面点 **uploading an existing file**
4. 把 `pocket-devcpp` 文件夹里的**所有东西**（`index.html`、`css`、`js`、`vendor`、`icons`、`manifest.webmanifest`、`sw.js`）一起拖进网页
   - 目录结构要保留：`js/` 里的文件必须在 `js/` 目录里
5. 点 **Commit changes**

### 第 2 步：开启 Pages（还是在电脑上）

1. 仓库页 → **Settings** → 左栏 **Pages**
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，目录保持 `/ (root)` → **Save**
4. 等 1～2 分钟，刷新页面，顶部会出现：
   `Your site is live at https://你的用户名.github.io/pocket-devcpp/`

### 第 3 步：iPad 上安装（30 秒）

1. Safari 打开上面那个网址，等页面正常显示
2. 点 Safari 的 **分享** 按钮（方框 + 向上箭头）
3. 往下滑，选 **添加到主屏幕**
4. 名字改成「随身 Dev-C++」→ **添加**
5. 回到主屏幕，点开图标：全屏、没有地址栏，就是 App 了

> 第一次打开请保持联网（要下载 620KB 的运行引擎并缓存）。之后就可以离线用了。

### 备选方案

- **只能在局域网用**：电脑开着 `tools/serve.cmd`，iPad 用同一 WiFi 打开打印出来的地址。出门就不能用了。
- **其他静态托管**：Vercel、Cloudflare Pages、Netlify 都行，把整个文件夹拖上去即可。
- **国内网络打不开 GitHub**：换 Cloudflare Pages；三个方案任选一个，装好的 App 都一样能离线。

---

## 三、iPad 上 5 步自检

| # | 做什么 | 应该看到 |
|---|---|---|
| 1 | 从主屏幕图标打开 | 全屏，没有地址栏 |
| 2 | 新建 → 选「A + B」例题 → 标准输入填 `1 2` → 点运行 | 程序输出 `3` |
| 3 | 删掉一个分号再点「检查」 | 提示第几行少分号，能点击跳行 |
| 4 | 开飞行模式 → 上滑杀掉 App → 重开 | 代码还在，还能运行 |
| 5 | 写 `int main(){while(1){}}` 运行 | 约 2 秒内自动停止，并提示出错 |

有哪一步不对，把现象告诉我，我改。

---

## 四、能做什么 / 不能做什么

**离线引擎（默认）能跑什么**：基本类型、一维/二维数组、指针、函数与递归、`if/for/while/switch`、`printf`/`scanf`、`cin`/`cout`、`string.h`（strlen/strcpy/strcat/strcmp）、`math.h`、字符数组与字符串处理，**以及简单结构体**。

离线引擎原本不支持 `struct`，解释器的 `scanf` 也不能直接写进数组元素。这两点我已经用**兼容层**补上了（只影响运行，不改你的源码）：

- **结构体展开**：`struct Student{ char name[20]; int score; };` + `a[i].score` → 自动展开成 `char a_name[3][20]; int a_score[3];` + `a_score[i]`。支持结构体变量、结构体数组、二维结构体数组、`char` 数组成员、`= {0}` 清零。
- **scanf 改写**：`scanf("%d", &a[i]);` → `a[i] = __pocket_rd_int();`，这样数组输入不再报 Memory overflow。
- **中文转义**：字符串里的中文会先换成占位符、运行后自动还原，`printf("平均分 = %d", s)` 正常显示。副作用：`strlen("中文")` 这类求长度的结果不准。
- **enum 展开**：`enum Color { RED, GREEN = 5, BLUE };` → `#define RED 0 / GREEN 5 / BLUE 6`，`enum Color c;` → `int c;`。只支持整数常量初值（表达式会提示切联网）。

当前版本 **v1.4.2**。有更新时页面顶部会出现提示条，点「立即更新」即可；菜单里也能看到版本号和更新记录。

### v1.4.2

- **`struct` / `union` / `enum` 定义的 `}` 后自动补 `;`**：打 `struct Student {` 回车再打 `}`，直接得到 `};`。
- 回车时自动补的 `}` 会被"吃掉"，不会出现两个 `}`；普通函数块、`if` 块不会乱加分号。

### v1.4.1 修复的编辑手感

- **长文件后半段"隐身"**：高亮层原来被固定在视口高度、自己裁剪自己，超过十几行就看不到。现在高亮层按内容撑高、裁剪交给外层容器。
- **`}` 自动对齐**：在行首输入 `}` 时，自动缩进到配对的 `{` 所在行的缩进（Dev-C++ 的手感）。
- **`{}` 中间回车**：光标在 `{}` 里按回车，`}` 会自己移到下一行，光标停在缩进位。
- **`#include <` 自动补 `>`**；手打收尾符时不会出现两个（`))`、`>>`）。
- 比较用的 `<`（如 `a < b`）不会误补 `>`。

实测覆盖（`node tests/compat.test.mjs` 9/9、`node tests/struct-compat.test.mjs` 13/13、`node tests/examples.test.mjs` 14/14）：数组循环输入、浮点数组、二维数组输入、字符输入、混合格式、结构体数组录入、结构体排序（连名字一起交换）、全部内置例题、中文输出还原。

**离线仍不支持**（会提示你切在线）：结构体指针 `->`、结构体当函数参数/返回值、结构体整体赋值、嵌套结构体、`enum`、`class`、模板、STL（`vector`/`string`/`sort`）、`malloc`/`free`、多文件链接、`goto`、文件读写、交互式输入。

**这些都能用「联网真实 g++」跑**：菜单 →「切换引擎」（或运行后点提示里的「切换并重新运行」）。在线模式是真正的 **GCC 14**，和电脑上 Dev-C++ 同一编译器家族：上面所有"不支持"的它都支持，报错也几乎一样，还能直接看运行结果。实测通过的用例：C++ struct + std::string、C struct、scanf 读 stdin、vector + sort、编译错误行号、类型错误。
代价：必须联网；代码会发送到 godbolt.org（公共编译器服务）；公共服务有频率限制。

**和 Dev-C++ 的报错差别**：Dev-C++ 是真 g++，一次能列多处编译/链接错误；本地引擎是解释器，通常只报第一处，措辞不同，也不检查 `printf` 格式串这类警告。好处是数组越界、除零、用未初始化变量会直接报错并给行号。本站做了「结构预检」，能先把括号/注释/main 这类低级错误一次列全。

---

## 五、数据安全

代码保存在浏览器的 localStorage 里。iPadOS 有可能清理网站数据，**重要作业请定期用「导出备份」** 存到「文件」App；换设备/换网址也能用「导入备份」恢复。

---

## 六、更新

我改完代码后，你重新上传覆盖 GitHub 仓库里的对应文件即可（Commit 一次）。iPad 下次打开会自动拿到新版本。

---

## 七、目录说明

```
index.html              页面骨架（工具栏/编辑区/输出面板/状态栏）
css/app.css             两套主题、iPad 安全区、布局
js/app.js               界面装配、事件、运行流程
js/editor.js            编辑器：高亮图层、行号、缩进、括号配对、撤销
js/highlight.js         C/C++ 词法着色（纯函数）
js/storage.js           文件与设置持久化、备份导入导出
js/runner.js            运行引擎：本地 JSCPP / 联网 g++
js/errors.js            报错解析、中文提示、结构预检
js/examples.js          课本例题
vendor/JSCPP.es5.min.js 离线运行引擎（MIT）
sw.js                   离线缓存
manifest.webmanifest    主屏幕图标与全屏配置
tools/serve.cmd         本机预览服务器
tools/make-icons.py     图标生成脚本
```

---

## 八、开源声明

- 离线运行引擎：[JSCPP](https://github.com/felixhao28/JSCPP)，MIT License。
- 联网模式使用 [Compiler Explorer](https://godbolt.org) 的公开 API（GCC 14），非本项目所有，受其服务条款约束。
- 其余代码为本项目原创，可随意修改自用。
- 联网模式默认关闭；启用后代码会发送到 godbolt.org。
