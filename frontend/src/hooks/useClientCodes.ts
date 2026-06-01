import { useMetaInUse, type UseMetaOptions } from './useMetaInUse'

/** Distinct in-use `clientCode` values for the list-page multi-select (SYS-046). */
export function useClientCodes(options?: UseMetaOptions) {
  return useMetaInUse('client-codes', '/components/meta/client-codes', options)
}
