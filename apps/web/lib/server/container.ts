import 'server-only';
import { getContainer } from '@yeg/config';

/**
 * Server-only access to the DI container. Next route handlers resolve use cases
 * from here. The container is a process singleton (DB/Redis clients are pooled).
 */
export function container() {
  return getContainer();
}
