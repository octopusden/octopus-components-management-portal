import { useMetaInUse, type UseMetaOptions } from './useMetaInUse'

/** Distinct in-use BASE-row `jiraProjectKey` values for the list-page multi-select (SYS-046). */
export function useJiraProjectKeys(options?: UseMetaOptions) {
  return useMetaInUse('jira-project-keys', '/components/meta/jira-project-keys', options)
}
