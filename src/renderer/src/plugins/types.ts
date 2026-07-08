import type { ComponentType } from 'react';

export interface TabPluginComponent {
  // biome-ignore lint/suspicious/noExplicitAny: icon components have type-specific props
  icon: ComponentType<any>;
}
