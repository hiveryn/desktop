import type { ComponentType } from 'react';

export interface TabPluginComponent {
  // biome-ignore lint/suspicious/noExplicitAny: plugin components accept arbitrary props by tab type
  icon: ComponentType<any>;
  // biome-ignore lint/suspicious/noExplicitAny: plugin components accept arbitrary props by tab type
  content: ComponentType<any>;
}
