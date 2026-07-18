import { config } from '../../config/index';
import { EventDetail, getEventDetail, recordShare } from '../../utils/api';
import { formatDate, formatDistance } from '../../utils/format';
import { getEventDisplayStatus } from '../../utils/event-detail';
import { getUserKey } from '../../utils/user';
import { resolveMiniProgramEnvVersion } from '../../utils/launch';

const CANVAS_W = 375;
const CANVAS_H = 667;

function getCanvasDisplaySize() {
  const windowInfo =
    typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const windowWidth = Number(windowInfo?.windowWidth) || CANVAS_W;
  const rpx = windowWidth / 750;
  const horizontalChrome = 68 * rpx; // page horizontal padding + canvas wrapper padding.
  const displayW = Math.max(260, Math.min(CANVAS_W, Math.floor(windowWidth - horizontalChrome)));
  return {
    width: displayW,
    height: Math.round((displayW * CANVAS_H) / CANVAS_W),
  };
}

/** 自动换行绘制，超出 maxLines 截断加省略号。返回绘制后下一个 y 坐标。 */
function wrapText(
  ctx: WechatMiniprogram.CanvasContext.CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  if (!text) return y;
  const chars = Array.from(text);
  let line = '';
  let currentY = y;
  let lineCount = 0;

  for (let i = 0; i < chars.length; i += 1) {
    const testLine = line + chars[i];
    const width = ctx.measureText(testLine).width;
    if (width > maxWidth && line) {
      lineCount += 1;
      if (lineCount >= maxLines) {
        // 当前已是最后一行，截断加省略号
        let truncated = line;
        while (ctx.measureText(truncated + '…').width > maxWidth && truncated.length > 0) {
          truncated = truncated.slice(0, -1);
        }
        ctx.fillText(truncated + '…', x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line, x, currentY);
      line = chars[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  // 绘制最后一行
  if (line) {
    ctx.fillText(line, x, currentY);
  }
  return currentY + lineHeight;
}

/** 画圆角矩形路径（不填充不描边，需调用方执行 fill/stroke）。 */
function drawRoundRect(
  ctx: WechatMiniprogram.CanvasContext.CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

interface CanvasNode {
  width: number;
  height: number;
  getContext: (type: string) => WechatMiniprogram.CanvasContext.CanvasRenderingContext2D;
}

interface CanvasImage {
  width: number;
  height: number;
  path: string;
}

interface ShareCardData {
  id: string;
  userKey: string;
  loading: boolean;
  error: string;
  saving: boolean;
  event: EventDetail | null;
  canvasDisplayW: number;
  canvasDisplayH: number;
  tempFilePath: string;
}

const initialCanvasSize = getCanvasDisplaySize();

Page({
  data: {
    id: '',
    userKey: '',
    loading: true,
    error: '',
    saving: false,
    event: null as EventDetail | null,
    canvasDisplayW: initialCanvasSize.width,
    canvasDisplayH: initialCanvasSize.height,
    tempFilePath: '',
  } as ShareCardData,

  canvasNode: null as CanvasNode | null,

  onLoad(query: { id?: string }) {
    this.setData({ id: query.id || '', userKey: getUserKey() });
    this.updateCanvasDisplaySize();
    this.load();
  },

  onResize() {
    this.updateCanvasDisplaySize();
  },

  updateCanvasDisplaySize() {
    const size = getCanvasDisplaySize();
    this.setData({ canvasDisplayW: size.width, canvasDisplayH: size.height });
  },

  reload() {
    this.updateCanvasDisplaySize();
    this.load();
  },

  async load() {
    if (!this.data.id) {
      this.setData({ loading: false, error: '赛事不存在或未发布' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const detail = await getEventDetail(this.data.id);
      await new Promise<void>((resolve) => {
        this.setData({ event: detail.event, loading: false }, () => resolve());
      });
      await this.initCanvasAndDraw();
    } catch (error) {
      this.setData({
        loading: false,
        event: null,
        error: (error as Error).message || '赛事不存在或未发布',
      });
    }
  },

  /** 异步获取 Canvas 2D 节点并绘制 */
  initCanvasAndDraw(): Promise<void> {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery();
      query
        .select('#shareCanvas')
        .fields({ node: true, size: true }, (res) => {
          if (!res || !res.node) {
            this.setData({ error: '画布初始化失败' });
            resolve();
            return;
          }
          const canvas = res.node as unknown as CanvasNode;
          this.canvasNode = canvas;
          const ctx = canvas.getContext('2d');
          const windowInfo =
            typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
          const dpr = Number(windowInfo?.pixelRatio) || 1;
          canvas.width = CANVAS_W * dpr;
          canvas.height = CANVAS_H * dpr;
          ctx.scale(dpr, dpr);
          // 先渲染布局，再异步绘制（等小程序码图片加载）
          wx.nextTick(() => {
            this.drawShareCard(ctx).then(resolve).catch(() => resolve());
          });
        })
        .exec();
    });
  },

  /** 主绘制流程，包含小程序码图片加载（异步）。 */
  async drawShareCard(ctx: WechatMiniprogram.CanvasContext.CanvasRenderingContext2D): Promise<void> {
    const event = this.data.event;
    const W = CANVAS_W;
    const H = CANVAS_H;

    // 1. 背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // 2. 顶部品牌区
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, 0, W, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('哪场值得跑', 20, 22);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '12px sans-serif';
    ctx.fillText('大湾区跑步赛事决策工具', 20, 50);

    if (!event) {
      this.toTempFile();
      return;
    }

    // 3. 赛事名称
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 20px sans-serif';
    let y = wrapText(ctx, event.eventName || '赛事名称待确认', 20, 100, W - 40, 28, 2);

    // 4. 赛事元信息：城市 · 日期 · 距离
    const metaParts = [event.city, formatDate(event.eventDate), formatDistance(event.distanceItems)].filter(
      (part) => part && part !== '待确认' && part !== '距离待确认',
    );
    const metaText = metaParts.length > 0 ? metaParts.join(' · ') : '信息待确认';
    ctx.fillStyle = '#64748B';
    ctx.font = '14px sans-serif';
    y = wrapText(ctx, metaText, 20, y + 8, W - 40, 20, 1);

    // 5. 报名状态
    const displayStatus = getEventDisplayStatus(event.signupStatus, event.eventDate);
    const statusText = displayStatus.text;
    let statusColor = '#64748B';
    if (displayStatus.tone === 'positive') statusColor = '#2A9D8F';
    else if (displayStatus.tone === 'urgent') statusColor = '#E76F51';
    else if (displayStatus.tone === 'neutral') statusColor = '#52736E';
    // 报名状态胶囊
    const statusPadX = 10;
    ctx.font = '13px sans-serif';
    const statusTextWidth = ctx.measureText(statusText).width;
    const statusBoxW = statusTextWidth + statusPadX * 2;
    const statusBoxH = 24;
    drawRoundRect(ctx, 20, y + 6, statusBoxW, statusBoxH, 12);
    ctx.fillStyle = statusColor;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(statusText, 20 + statusPadX, y + 6 + (statusBoxH - 13) / 2 + 1);

    // 截止倒计时提示（状态胶囊右侧）
    const deadlineText = this.buildDeadlineText(event);
    if (deadlineText) {
      ctx.fillStyle = statusColor;
      ctx.font = '12px sans-serif';
      ctx.fillText(deadlineText, 20 + statusBoxW + 10, y + 12);
    }
    y += 6 + statusBoxH + 16;

    // 6. 跑者标签（前 3 个）
    const tags = (event.tags || []).slice(0, 3);
    if (tags.length > 0) {
      ctx.font = '12px sans-serif';
      let tagX = 20;
      const tagY = y;
      const tagH = 26;
      const tagGap = 8;
      for (const tag of tags) {
        const textWidth = ctx.measureText(tag).width;
        const boxW = textWidth + 20;
        if (tagX + boxW > W - 20) break;
        drawRoundRect(ctx, tagX, tagY, boxW, tagH, 13);
        ctx.fillStyle = '#E8F5F3';
        ctx.fill();
        ctx.fillStyle = '#2A9D8F';
        ctx.fillText(tag, tagX + 10, tagY + (tagH - 12) / 2 + 1);
        tagX += boxW + tagGap;
      }
      y = tagY + tagH + 16;
    }

    // 7. 跑者摘要
    if (event.judgementSummary) {
      ctx.fillStyle = '#334155';
      ctx.font = '14px sans-serif';
      y = wrapText(ctx, event.judgementSummary, 20, y, W - 40, 22, 4);
    }

    // 8. 小程序码区域（底部右侧）— 内容较少时上移，减少海报中部留白。
    const fixedFooterY = H - 156;
    const raisedFooterY = H - 280;
    const footerPanelY = Math.min(fixedFooterY, Math.max(raisedFooterY, y + 24));
    const footerPanelH = 112;
    const codeSize = 82;
    const codeX = W - 32 - codeSize;
    const codeY = footerPanelY + 15;

    drawRoundRect(ctx, 20, footerPanelY, W - 40, footerPanelH, 14);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();

    // 先绘制左侧提示文字
    ctx.fillStyle = '#64748B';
    ctx.font = '12px sans-serif';
    ctx.fillText('扫码查看赛事决策卡', 36, footerPanelY + 30);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '11px sans-serif';
    ctx.fillText('更多跑者评测', 36, footerPanelY + 52);
    ctx.fillText('报名清单与官方确认', 36, footerPanelY + 72);

    // 尝试加载小程序码
    let codeImage: CanvasImage | null = null;
    try {
      const envVersion = resolveMiniProgramEnvVersion(
        wx.getAccountInfoSync().miniProgram.envVersion,
      );
      const codeUrl = `${config.apiBaseUrl}/api/wxacode?eventId=${event.id}&envVersion=${envVersion}`;
      const info = await this.loadImage(codeUrl);
      codeImage = info;
    } catch {
      codeImage = null;
    }

    // 小程序码边框背景
    drawRoundRect(ctx, codeX, codeY, codeSize, codeSize, 8);
    ctx.fillStyle = '#F1F5F9';
    ctx.fill();

    if (codeImage) {
      try {
        const image = (this.canvasNode as any).createImage();
        const loaded: Promise<void> = new Promise((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('image load error'));
          image.src = codeImage!.path;
        });
        await loaded;
        // 居中绘制（保持正方形，留出小程序码安静区）
        ctx.drawImage(image, codeX + 6, codeY + 6, codeSize - 12, codeSize - 12);
      } catch {
        this.drawCodePlaceholder(ctx, codeX, codeY, codeSize);
      }
    } else {
      this.drawCodePlaceholder(ctx, codeX, codeY, codeSize);
    }

    // 9. 底部合规提示
    ctx.fillStyle = '#94A3B8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AI 整理，仅供参考，报名以官方为准。', W / 2, H - 26);
    ctx.textAlign = 'left';

    // 生成临时图片
    this.toTempFile();
  },

  /** 小程序码加载失败时的占位文字 */
  drawCodePlaceholder(
    ctx: WechatMiniprogram.CanvasContext.CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('扫码查看', x + size / 2, y + size / 2 - 6);
    ctx.fillText('更多', x + size / 2, y + size / 2 + 10);
    ctx.textAlign = 'left';
  },

  /** 加载网络图片为本地临时文件信息 */
  loadImage(src: string): Promise<CanvasImage> {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src,
        success: (res) => resolve({ width: res.width, height: res.height, path: res.path }),
        fail: (err) => reject(new Error(err.errMsg || '图片加载失败')),
      });
    });
  },

  /** 计算「距截止还有 X 天」或「距比赛还有 X 天」提示文字 */
  buildDeadlineText(event: EventDetail): string {
    const target = event.signupDeadline || event.eventDate;
    if (!target) return '';
    const targetDate = new Date(target);
    if (Number.isNaN(targetDate.getTime())) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (event.signupDeadline && diffDays >= 0) {
      return diffDays === 0 ? '今天截止' : `距截止还有 ${diffDays} 天`;
    }
    if (!event.signupDeadline && diffDays >= 0) {
      return diffDays === 0 ? '就在今天' : `距比赛还有 ${diffDays} 天`;
    }
    return '';
  },

  /** 将 canvas 导出为临时图片文件 */
  toTempFile(): void {
    const canvas = this.canvasNode;
    if (!canvas) return;
    wx.canvasToTempFilePath({
      canvas: canvas as any,
      success: (res) => {
        this.setData({ tempFilePath: res.tempFilePath });
      },
      fail: () => {
        wx.showToast({ title: '图片生成失败', icon: 'none' });
      },
    }, this);
  },

  async saveImage() {
    if (!this.data.tempFilePath) {
      wx.showToast({ title: '图片生成中，请稍候', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      // 检查相册授权
      const setting = await wx.getSetting();
      if (setting.authSetting['scope.writePhotosAlbum'] === false) {
        // 明确拒绝过，引导去设置
        const modalRes = await wx.showModal({
          title: '需要相册权限',
          content: '保存图片需要相册权限，是否前往设置开启？',
          confirmText: '去设置',
        });
        if (modalRes.confirm) await wx.openSetting();
        return;
      }
      if (setting.authSetting['scope.writePhotosAlbum'] === undefined) {
        // 未授权过，主动请求
        await wx.authorize({ scope: 'scope.writePhotosAlbum' });
      }
      await wx.saveImageToPhotosAlbum({ filePath: this.data.tempFilePath });
      wx.showToast({ title: '已保存到相册', icon: 'success' });
      // 静默上报
      recordShare({
        userKey: this.data.userKey,
        eventId: this.data.id,
        shareType: 'image_generate',
        scene: 'share_card',
      }).catch(() => {});
    } catch {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onShareAppMessage() {
    const event = this.data.event;
    return {
      title: event ? `这场值得跑吗？${event.eventName}` : '哪场值得跑',
      path: event ? `/pages/event-detail/index?id=${event.id}` : '/pages/home/index',
      imageUrl: this.data.tempFilePath || undefined,
    };
  },
});
