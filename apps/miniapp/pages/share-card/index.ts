import { config } from '../../config/index';
import { EventDetail, getEventDetail, recordShare } from '../../utils/api';
import { formatDate, formatDistance, labelOf, runJudgementLabels } from '../../utils/format';
import { getEventDisplayStatus } from '../../utils/event-detail';
import { getUserKey } from '../../utils/user';
import { resolveMiniProgramEnvVersion } from '../../utils/launch';
import { enableProductShareOnly, getSharePayload, trackShare } from '../../utils/share';

const CANVAS_W = 375;
const CANVAS_H = 667;

// 新橙色主题色（与 theme-shell/index.wxss 的 --wr-* token 对齐，浅色版）
const COLOR = {
  primary: '#FF5C1A', // 主色/品牌色
  primaryText: '#EA580C', // 深橙文字（tag）
  primarySoft: '#FFF1EB', // 主色浅底
  tagBg: '#FFF7ED', // 橙 tag 底
  success: '#059669', // 成功绿（报名中）
  text: '#0F1923', // 主文字
  muted: '#6B7A8D', // 次文字
  bg: '#FFFFFF', // 整图背景
  surfaceSoft: '#F4F5F7', // 次要表面（卡片底/面板底）
  codeBg: '#EEF0F3', // 小程序码区背景
  border: 'rgba(15, 25, 35, 0.08)', // 细边框
} as const;

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

type Ctx2D = WechatMiniprogram.CanvasContext.CanvasRenderingContext2D;

/**
 * 画「跑前判断」横条（整宽圆角条，主色橙系）。
 * 左侧标签"跑前判断" + 右侧结论文字（适合优先关注 / 可以观望 / 信息待核实）。
 * 返回占用高度（含上下间距）。
 */
function drawJudgementBar(ctx: Ctx2D, judgement: string, x: number, y: number, w: number): number {
  const barH = 34;
  const padX = 14;
  const gap = 10;
  drawRoundRect(ctx, x, y, w, barH, 9);
  ctx.fillStyle = COLOR.primarySoft;
  ctx.fill();

  // 统一用 top baseline，文字垂直居中靠计算（字号12，barH34 → top 偏移 (34-12)/2=11）
  ctx.textBaseline = 'top';
  const textY = y + (barH - 13) / 2 + 1;
  // 左侧标签
  ctx.fillStyle = COLOR.muted;
  ctx.font = '12px sans-serif';
  ctx.fillText('跑前判断', x + padX, textY);
  const labelTextWidth = ctx.measureText('跑前判断').width;

  // 右侧结论（字号15，稍大，top 偏移微调）
  const conclusion = labelOf(runJudgementLabels, judgement);
  ctx.fillStyle = COLOR.primary;
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(conclusion, x + padX + labelTextWidth + gap, y + (barH - 16) / 2);

  return barH;
}

/**
 * 画「适合谁 / 需要注意」两栏对比卡片。
 * 左栏绿（✓ 适合谁）取 suitableFor，右栏橙（! 需要注意）取 notSuitableFor，各取前 maxItems 条。
 * 返回占用高度（含卡片本身，不含上下间距）。两栏都为空时返回 0。
 */
function drawFitColumns(
  ctx: Ctx2D,
  suitableFor: string[],
  notSuitableFor: string[],
  x: number,
  y: number,
  w: number,
  maxItems = 2,
): number {
  const fit = (suitableFor || []).slice(0, maxItems);
  const avoid = (notSuitableFor || []).slice(0, maxItems);
  if (fit.length === 0 && avoid.length === 0) return 0;

  const gap = 8;
  const colW = (w - gap) / 2;
  const padX = 12;
  const padY = 10;
  const titleH = 18;
  const lineH = 18;
  const rows = Math.max(fit.length, avoid.length, 1);
  const cardH = padY * 2 + titleH + gap + lineH * rows;

  const drawColumn = (
    cx: number,
    title: string,
    mark: string,
    titleColor: string,
    items: string[],
  ) => {
    drawRoundRect(ctx, cx, y, colW, cardH, 12);
    ctx.fillStyle = COLOR.surfaceSoft;
    ctx.fill();

    // 标题行：符号 + 标题
    ctx.textBaseline = 'top';
    ctx.fillStyle = titleColor;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`${mark} ${title}`, cx + padX, y + padY);

    // 条目
    ctx.fillStyle = COLOR.text;
    ctx.font = '12px sans-serif';
    const itemsY = y + padY + titleH + gap;
    for (let i = 0; i < items.length; i += 1) {
      const textY = itemsY + i * lineH;
      const maxWidth = colW - padX * 2;
      // 截断到单行
      let line = items[i];
      if (ctx.measureText(line).width > maxWidth) {
        while (ctx.measureText(`${line}…`).width > maxWidth && line.length > 0) {
          line = line.slice(0, -1);
        }
        line = `${line}…`;
      }
      ctx.fillText(`· ${line}`, cx + padX, textY);
    }
  };

  drawColumn(x, '适合谁', '✓', COLOR.success, fit);
  drawColumn(x + colW + gap, '需要注意', '!', COLOR.primaryText, avoid);

  return cardH;
}

/**
 * 画「跑者关注度 + 起点」行。
 * choiceCounts.total >= 10 时显示关注度，否则只显示 startPoint。两者都空返回 0。
 * 返回占用高度（含上下间距）。
 */
function drawChoiceAndStart(
  ctx: Ctx2D,
  choiceCounts: {
    interested: number;
    considering: number;
    registered: number;
    total: number;
  } | null,
  startPoint: string | null | undefined,
  x: number,
  y: number,
  w: number,
): number {
  const showChoice = choiceCounts && choiceCounts.total >= 10;
  const hasStart = Boolean(startPoint && startPoint.trim());
  if (!showChoice && !hasStart) return 0;

  ctx.textBaseline = 'top';
  ctx.fillStyle = COLOR.muted;
  ctx.font = '12px sans-serif';

  const parts: string[] = [];
  if (showChoice) {
    const cc = choiceCounts!;
    if (cc.interested > 0) parts.push(`已有 ${cc.interested} 人想跑`);
    if (cc.considering > 0) parts.push(`${cc.considering} 人在观望`);
    if (parts.length === 0) parts.push(`已有 ${cc.total} 人关注`);
  }
  const choiceText = parts.join(' · ');
  if (choiceText) {
    ctx.fillText(choiceText, x, y);
  }

  if (hasStart) {
    const startText = `📍 ${startPoint!.trim()}`;
    const startY = choiceText ? y + 20 : y;
    // 单行截断
    let line = startText;
    const maxWidth = w;
    if (ctx.measureText(line).width > maxWidth) {
      while (ctx.measureText(`${line}…`).width > maxWidth && line.length > 0) {
        line = line.slice(0, -1);
      }
      line = `${line}…`;
    }
    ctx.fillText(line, x, startY);
  }

  return choiceText && hasStart ? 40 : 20;
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
    enableProductShareOnly();
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
            this.drawShareCard(ctx)
              .then(resolve)
              .catch(() => resolve());
          });
        })
        .exec();
    });
  },

  /** 主绘制流程，包含小程序码图片加载（异步）。 */
  async drawShareCard(
    ctx: WechatMiniprogram.CanvasContext.CanvasRenderingContext2D,
  ): Promise<void> {
    const event = this.data.event;
    const W = CANVAS_W;
    const H = CANVAS_H;
    const padX = 20;
    const contentW = W - padX * 2;

    // 1. 背景
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, W, H);

    // 2. 顶部品牌行（白底橙字 + 细分隔线）
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOR.primary;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('哪场值得跑', padX, 18);
    ctx.fillStyle = COLOR.muted;
    ctx.font = '11px sans-serif';
    ctx.fillText('大湾区跑步赛事决策工具', padX, 42);
    // 细分隔线（用 1px 高的填充条，小程序 Canvas 类型不含 stroke API）
    ctx.fillStyle = COLOR.border;
    ctx.fillRect(padX, 62, contentW, 1);

    let y = 74;

    if (!event) {
      this.drawFooterPanel(ctx, y, W, H);
      this.toTempFile();
      return;
    }

    // 3. 讨论钩子（克制的单行橙字）
    ctx.fillStyle = COLOR.primary;
    ctx.font = 'bold 17px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('这场你跑不跑？', padX, y);
    y += 26;

    // 4. 赛事名 + meta
    ctx.fillStyle = COLOR.text;
    ctx.font = 'bold 19px sans-serif';
    y = wrapText(ctx, event.eventName || '赛事名称待确认', padX, y, contentW, 24, 2);

    const metaParts = [
      event.city,
      formatDate(event.eventDate),
      formatDistance(event.distanceItems),
    ].filter((part) => part && part !== '待确认' && part !== '距离待确认');
    const metaText = metaParts.length > 0 ? metaParts.join(' · ') : '信息待确认';
    ctx.fillStyle = COLOR.muted;
    ctx.font = '13px sans-serif';
    y = wrapText(ctx, metaText, padX, y + 4, contentW, 17, 1);
    y += 10;

    // 5. 跑前判断横条
    y += drawJudgementBar(ctx, event.runJudgement, padX, y, contentW);
    y += 12;

    // 6. 状态胶囊 + 倒计时
    const displayStatus = getEventDisplayStatus(event.signupStatus, event.eventDate);
    const statusText = displayStatus.text;
    let statusColor: string = COLOR.muted;
    if (displayStatus.tone === 'positive') statusColor = COLOR.success;
    else if (displayStatus.tone === 'urgent') statusColor = COLOR.primaryText;
    const statusPadX = 10;
    ctx.font = '13px sans-serif';
    const statusTextWidth = ctx.measureText(statusText).width;
    const statusBoxW = statusTextWidth + statusPadX * 2;
    const statusBoxH = 22;
    drawRoundRect(ctx, padX, y, statusBoxW, statusBoxH, 11);
    ctx.fillStyle = statusColor;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(statusText, padX + statusPadX, y + (statusBoxH - 13) / 2 + 1);

    const deadlineText = this.buildDeadlineText(event);
    if (deadlineText) {
      ctx.fillStyle = statusColor;
      ctx.font = '12px sans-serif';
      ctx.fillText(deadlineText, padX + statusBoxW + 10, y + 5);
    }
    y += statusBoxH + 12;

    // ===== 可选模块区（tag / 适合·注意 / 关注理由 / 关注度·起点）=====
    // 先算出底部面板的可用空间上限，再决定渲染哪些可选模块，避免内容溢出到面板上。
    const footerPanelH = 104;
    const complianceReserve = 22;
    const maxFooterY = H - footerPanelH - complianceReserve; // 面板顶最高位置
    const contentGap = 14; // 面板与内容之间的间距
    const contentLimit = maxFooterY - contentGap; // 内容底不得超过此值

    const tags = (event.tags || []).slice(0, 3);
    const reasons = (event.judgementReasons || []).slice(0, 2).filter(Boolean);
    const cc = event.choiceCounts;
    const showChoice = cc && cc.total >= 10;
    const hasStart = Boolean(event.startPoint && event.startPoint.trim());

    // 各可选模块的预估高度（含其后间距）
    const tagH = 24;
    const tagBlockH = tags.length > 0 ? tagH + 12 : 0;
    // fit 高度需用与 drawFitColumns 一致的公式
    const fitRows = Math.max(
      Math.min((event.suitableFor || []).length, 2),
      Math.min((event.notSuitableFor || []).length, 2),
      (event.suitableFor || []).length + (event.notSuitableFor || []).length > 0 ? 1 : 0,
    );
    const hasFit = (event.suitableFor || []).length + (event.notSuitableFor || []).length > 0;
    const fitBlockH = hasFit ? 10 * 2 + 18 + 8 + 18 * Math.max(fitRows, 1) + 12 : 0;
    const reasonBlockH = reasons.length > 0 ? 20 * reasons.length + 8 : 0;
    const choiceBlockH = showChoice || hasStart ? (showChoice && hasStart ? 36 : 20) + 8 : 0;

    // 按优先级从低到高丢弃（先丢 tag，再丢关注度·起点，再丢理由），直到内容能放下
    let drawTags = tags.length > 0;
    let drawFit = hasFit;
    let drawReasons = reasons.length > 0;
    let drawChoice = showChoice || hasStart;
    const fits = (usedH: number) => y + usedH <= contentLimit;
    let usedH =
      (drawTags ? tagBlockH : 0) +
      (drawFit ? fitBlockH : 0) +
      (drawReasons ? reasonBlockH : 0) +
      (drawChoice ? choiceBlockH : 0);
    if (!fits(usedH)) {
      drawTags = false;
      usedH -= tagBlockH;
    }
    if (!fits(usedH)) {
      drawChoice = false;
      usedH -= choiceBlockH;
    }
    if (!fits(usedH)) {
      drawReasons = false;
      usedH -= reasonBlockH;
    }
    // fit 是核心模块，最后才考虑；通常到这一步已经能放下

    // 7. 跑者标签
    if (drawTags) {
      ctx.font = '12px sans-serif';
      ctx.textBaseline = 'top';
      let tagX = padX;
      const tagY = y;
      const tagGap = 8;
      for (const tag of tags) {
        const textWidth = ctx.measureText(tag).width;
        const boxW = textWidth + 20;
        if (tagX + boxW > W - padX) break;
        drawRoundRect(ctx, tagX, tagY, boxW, tagH, 12);
        ctx.fillStyle = COLOR.tagBg;
        ctx.fill();
        ctx.fillStyle = COLOR.primaryText;
        ctx.fillText(tag, tagX + 10, tagY + (tagH - 12) / 2 + 1);
        tagX += boxW + tagGap;
      }
      y += tagH + 12;
    }

    // 8. 适合谁 / 需要注意（两栏对比）
    if (drawFit) {
      const fitH = drawFitColumns(
        ctx,
        event.suitableFor || [],
        event.notSuitableFor || [],
        padX,
        y,
        contentW,
        2,
      );
      if (fitH > 0) y += fitH + 12;
    }

    // 9. 关注理由
    if (drawReasons) {
      ctx.font = '13px sans-serif';
      ctx.textBaseline = 'top';
      for (const reason of reasons) {
        ctx.fillStyle = COLOR.primary;
        ctx.fillText('▸', padX, y);
        ctx.fillStyle = COLOR.text;
        const markWidth = ctx.measureText('▸ ').width;
        let line = reason;
        const maxWidth = contentW - markWidth;
        if (ctx.measureText(line).width > maxWidth) {
          while (ctx.measureText(`${line}…`).width > maxWidth && line.length > 0) {
            line = line.slice(0, -1);
          }
          line = `${line}…`;
        }
        ctx.fillText(line, padX + markWidth, y);
        y += 20;
      }
      y += 8;
    }

    // 10. 跑者关注度 + 起点
    if (drawChoice) {
      const choiceH = drawChoiceAndStart(
        ctx,
        cc,
        hasStart ? event.startPoint : null,
        padX,
        y,
        contentW,
      );
      if (choiceH > 0) y += choiceH + 8;
    }

    // 11. 底部扫码面板（先画面板静态部分，再异步加载小程序码补绘）
    const codeRect = this.drawFooterPanel(ctx, y, W, H);
    await this.drawFooterCode(ctx, codeRect, event);
    this.toTempFile();
  },

  /** 画底部扫码面板 + 合规提示，返回小程序码区域坐标。
   *  面板紧贴内容底部（contentBottomY + 间距），但有上限保护：面板底不得侵入底部合规提示区。
   *  这样内容多时面板会下移让位，而不是盖住内容。 */
  drawFooterPanel(
    ctx: WechatMiniprogram.CanvasContext.CanvasRenderingContext2D,
    contentBottomY: number,
    W: number,
    H: number,
  ): { x: number; y: number; size: number } {
    const footerPanelH = 104;
    const complianceReserve = 22; // 底部合规提示预留高度
    // 面板顶最高只能到这里（保证面板底 + 合规提示不超出画布）
    const maxFooterY = H - footerPanelH - complianceReserve;
    const footerPanelY = Math.min(maxFooterY, contentBottomY + 14);
    const codeSize = 78;
    const codeX = W - 28 - codeSize;
    const codeY = footerPanelY + (footerPanelH - codeSize) / 2;

    drawRoundRect(ctx, 20, footerPanelY, W - 40, footerPanelH, 14);
    ctx.fillStyle = COLOR.surfaceSoft;
    ctx.fill();

    // 左侧提示文字（垂直居中对齐码区）
    ctx.fillStyle = COLOR.muted;
    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'top';
    const textLeftX = 36;
    ctx.fillText('扫码看完整决策卡', textLeftX, footerPanelY + 26);
    ctx.font = '11px sans-serif';
    ctx.fillText('报名清单 · 官方确认', textLeftX, footerPanelY + 50);

    // 小程序码边框背景
    drawRoundRect(ctx, codeX, codeY, codeSize, codeSize, 8);
    ctx.fillStyle = COLOR.codeBg;
    ctx.fill();

    // 合规提示
    ctx.fillStyle = COLOR.muted;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AI 整理，仅供参考，报名以官方为准。', W / 2, H - 22);
    ctx.textAlign = 'left';

    return { x: codeX, y: codeY, size: codeSize };
  },

  /** 异步补绘小程序码到底部面板的码区。加载失败画占位。 */
  async drawFooterCode(
    ctx: WechatMiniprogram.CanvasContext.CanvasRenderingContext2D,
    rect: { x: number; y: number; size: number },
    event: EventDetail,
  ): Promise<void> {
    let codeImage: CanvasImage | null = null;
    try {
      const envVersion = resolveMiniProgramEnvVersion(
        wx.getAccountInfoSync().miniProgram.envVersion,
      );
      const codeUrl = `${config.apiBaseUrl}/api/wxacode?eventId=${event.id}&envVersion=${envVersion}`;
      codeImage = await this.loadImage(codeUrl);
    } catch {
      codeImage = null;
    }
    if (codeImage) {
      try {
        const image = (this.canvasNode as any).createImage();
        const loaded: Promise<void> = new Promise((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('image load error'));
          image.src = codeImage!.path;
        });
        await loaded;
        ctx.drawImage(image, rect.x + 6, rect.y + 6, rect.size - 12, rect.size - 12);
      } catch {
        this.drawCodePlaceholder(ctx, rect.x, rect.y, rect.size);
      }
    } else {
      this.drawCodePlaceholder(ctx, rect.x, rect.y, rect.size);
    }
  },

  /** 小程序码加载失败时的占位文字 */
  drawCodePlaceholder(
    ctx: WechatMiniprogram.CanvasContext.CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    ctx.fillStyle = COLOR.muted;
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
    wx.canvasToTempFilePath(
      {
        canvas: canvas as any,
        success: (res) => {
          this.setData({ tempFilePath: res.tempFilePath });
        },
        fail: () => {
          wx.showToast({ title: '图片生成失败', icon: 'none' });
        },
      },
      this,
    );
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
    trackShare('page_share', 'event_detail', event?.id);
    if (!event) return getSharePayload('home', '/pages/home/index');
    return getSharePayload(
      'event_detail',
      `/pages/event-detail/index?id=${event.id}`,
      {
        eventName: event.eventName,
        city: event.city,
        eventDate: event.eventDate,
        distance: event.distanceItems.join('、'),
        judgement: event.runJudgement,
      },
      { ...event.resolvedShare, imageUrl: this.data.tempFilePath || event.resolvedShare?.imageUrl },
    );
  },
});
