declare global { interface HTMLElement { setCssStyles(styles: Partial<CSSStyleDeclaration>): void; setCssProps(props: Record<string, string>): void; } } export {};
