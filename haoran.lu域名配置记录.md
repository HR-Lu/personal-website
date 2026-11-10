# haoran.lu 域名配置记录

> 最后更新：2026-11-03

## 一、域名基本信息

| 项目 | 内容 |
|---|---|
| 域名 | haoran.lu（卢森堡 ccTLD，注册局 RESTENA） |
| 注册商 | Regery（上游 Hosting Concepts / OpenProvider，荷兰） |
| 购买价格 | $18.99/年 |
| 到期时间 | 2027-11-01 |
| WHOIS 隐私保护 | 已开启（注册局提供） |
| ICP 备案 | **不可备案**（.lu 不在工信部批复后缀名单内） |

**结论**：建站只能用境外节点（EdgeOne 须选「全球不含中国大陆」）或境外服务器（如腾讯云香港轻量）。

## 二、托管方案

- 平台：**腾讯云 EdgeOne Pages**（免费版）
- 加速区域：**全球（不含中国大陆）**——含大陆会被要求备案，.lu 无法通过，免费版选定后不可改
- 源文件：`/Users/lhr/EnMo/website/index.html`（星空名字单页）
- 证书：EdgeOne 自动免费签发 HTTPS，无需手动申请

## 三、DNS 管理说明

- 曾尝试切到 DNSPod（分配的专属 NS 为 `giles.dnspod.net` / `difficult.dnspod.net`，已在 Regery 填入），但全球实际生效的权威 NS 目前仍是 Regery 后台的 **OpenProvider**：
  - `ns1.openprovider.nl`
  - `ns2.openprovider.be`
  - `ns3.openprovider.eu`
- **所有解析记录一律在 Regery 的「DNS 记录」面板添加**，不要在 DNSPod 加（当前不生效）。
- DNSPod 里已加的同名记录暂不影响，以后若 NS 真正切换过去再使用。

## 四、已完成配置（www.haoran.lu）✅

| # | 类型 | Host | 值 | 状态 |
|---|---|---|---|---|
| 1 | TXT | edgeonereclaim.www | reclaim-e57wxt1520o9g2s1ooknkzkj9a980e3k | 已生效（归属验证，保留勿删） |
| 2 | CNAME | www | www.haoran.lu.pages.dnsoe4.com | 已生效 |

解析链路：

```
www.haoran.lu
  → CNAME www.haoran.lu.pages.dnsoe4.com
  → 43.174.246.112 / 43.174.247.112（EdgeOne 境外节点）
```

- 部署状态：成功
- HTTPS：⚠️ 2026-11-03 复查时边缘只回 `*.cdn.myqcloud.com` 兜底证书，浏览器报证书不匹配；需在控制台重新配置免费证书（见第七节）

## 五、根域名 haoran.lu 配置 ✅（证书签发中）

已完成记录（均在 Regery 添加）：

| # | 类型 | Host | 值 | 状态 |
|---|---|---|---|---|
| 1 | TXT | edgeonereclaim | reclaim-6tuf1e30oy9qdudtjio6vogvqusc9fi9 | 已生效（保留勿删） |
| 2 | A | @ | 43.174.246.112 | 已全球生效 |
| 3 | A | @ | 43.174.247.112 | 已全球生效 |

关键坑记录：

- Regery **禁止根域名 @ 使用 CNAME**（类型列表也没有 ALIAS），最终用 **A 记录 ×2** 接入。
- EdgeOne 激活检测一度只提示"未配置 CNAME"，A 记录生效并经全球传播后状态转为正常。
- A 记录 IP 来自 www 的 CNAME 最终指向（EdgeOne 任播节点，靠 SNI 区分站点）。

当前状态（2026-11-03 17:15 实测）：

- http://haoran.lu 正常返回站点内容（200，Content-Length 9062）
- DNS 全部正确：A 记录 ×2 与控制台接入目标 `haoran.lu.pages.dnsoe6.com` 均指向 43.174.246.112 / 247.112；无 CAA 记录阻拦签发；TXT 归属验证在
- **HTTPS 不可用**：443 握手边缘只下发 `*.cdn.myqcloud.com` 兜底证书（WoTrus 签发），SAN 不含 haoran.lu → 浏览器证书不匹配。控制台自定义域名列表 HTTPS 列显示「● 未配置 [配置]」
- 结论：不是 DNS 问题，是该项目边缘证书未配置/未下发（疑似重建项目后 dnsoe4→dnsoe6，证书绑定丢失，www 同样受影响）
- 处理：点该行「配置」→ 选 **EdgeOne 免费证书** → 确认，等 5～30 分钟全球下发；www 行若也是「未配置」同样操作；成功后开「强制 HTTPS」

验证命令：

```bash
curl -s "https://dns.google/resolve?name=haoran.lu&type=A"
```

## 六、踩过的坑（备查）

1. EdgeOne 首次开通若选了含大陆区域，绑域名会提示未备案 → 只能删项目重建选境外区域。
2. 添加自定义域名分两步：先 **TXT 验证归属**，再给接入地址（www 给 CNAME，根域给 A/CNAME），两步记录不能混用。
3. Regery 面板根域名 **不允许 CNAME**，提示改用 ALIAS，但该账号类型下拉里没有 ALIAS → 用 A 记录解决。
4. .lu 新域名注册后，注册局（RESTENA）根区委派发布有数小时延迟，期间全网查询 NXDOMAIN 属正常。
5. 本机部分 DNS 查询被网络环境劫持返回假结果（198.18.x.x），排查时应使用 DoH：
   - `https://cloudflare-dns.com/dns-query?name=域名&type=类型`
   - `https://dns.google/resolve?name=域名&type=类型`

## 七、后续待办

- [x] 根域名加两条 A 记录，EdgeOne 已激活
- [ ] 在控制台点「配置」为 haoran.lu（及 www）申请 EdgeOne 免费证书，等边缘下发后确认 https 可访问（2026-11-03 复查两域名均只回兜底证书）
- [ ] EdgeOne 中设置 www 与根域名互相重定向（建议统一到根域名），并开启「强制 HTTPS」
- [ ] 写后端时的架构预案（.lu 不可备案）：
  - 简单接口：EdgeOne Pages Functions
  - 复杂后端：腾讯云香港轻量，加 `api.haoran.lu`（A 记录指香港 IP），前端处理好 CORS 与 HTTPS
  - 不可用大陆服务器 80/443 对外；不要用套代理藏源站的违规方式绕备案
