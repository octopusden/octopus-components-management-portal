interface MavenRow {
  groupPattern: string
  artifactPattern: string
  extension?: string | null
  classifier?: string | null
}

/** `group:artifact[:extension[:classifier]]`, as CRS writes a GAV; a classifier alone keeps an empty extension slot. */
export function mavenCoordinate(row: MavenRow): string {
  const extension = row.extension?.trim() ?? ''
  const classifier = row.classifier?.trim() ?? ''
  const parts = [row.groupPattern.trim(), row.artifactPattern.trim()]
  if (extension || classifier) parts.push(extension)
  if (classifier) parts.push(classifier)
  return parts.join(':')
}
