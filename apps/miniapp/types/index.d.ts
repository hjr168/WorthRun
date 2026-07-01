interface IAppOption {
  globalData: Record<string, never>;
  onLaunch?: () => void;
}

declare const wx: any;
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number): number;
declare function App<T extends object = Record<string, unknown>>(options: T): void;
declare function Page(options: Record<string, any> & ThisType<any>): void;
declare function Component(options: Record<string, any> & ThisType<any>): void;

declare namespace WechatMiniprogram {
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
