import { dispatch } from '../../../keys/dispatcher';
import type { RouteKey } from '../../../terminal';

// Routes terminal keydowns through the app's global keyboard dispatcher. This
// indirection keeps the terminal module free of the keys/dispatcher import
// (which transitively reaches the @components barrel), so the module stays out
// of that import cycle.
export const dispatcherRouteKey: RouteKey = (event) => dispatch(event);
