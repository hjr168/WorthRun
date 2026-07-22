interface IAppOption {
  globalData: Record<string, never>;
  onLaunch?: () => void;
}

declare const wx: any;
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number): number;
declare function App<T extends object = Record<string, unknown>>(options: T): void;
declare function Page(options: Record<string, any> & ThisType<any>): void;
declare function Component(options: Record<string, any> & ThisType<any>): void;
declare function getCurrentPages(): any[];

declare namespace WechatMiniprogram {
  namespace CanvasContext {
    interface TextMetrics {
      width: number;
    }

    interface CanvasRenderingContext2D {
      fillStyle: string;
      font: string;
      textAlign: string;
      textBaseline: string;
      beginPath(): void;
      moveTo(x: number, y: number): void;
      arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
      closePath(): void;
      fill(): void;
      fillRect(x: number, y: number, width: number, height: number): void;
      fillText(text: string, x: number, y: number): void;
      measureText(text: string): TextMetrics;
      scale(x: number, y: number): void;
      drawImage(image: unknown, x: number, y: number, width: number, height: number): void;
    }
  }

  interface Input {
    detail: { value: string };
  }

  interface PickerChange {
    detail: { value: string | number };
  }

  interface CustomEvent {
    detail: any;
    currentTarget: { dataset: Record<string, unknown> };
  }

  interface TouchEvent {
    currentTarget: { dataset: Record<string, unknown> };
  }
}
