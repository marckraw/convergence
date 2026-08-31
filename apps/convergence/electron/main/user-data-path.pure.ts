export interface UserDataPathInput {
  defaultPath: string
  override?: string | null
}

export function resolveUserDataPath(input: UserDataPathInput): string {
  const override = input.override?.trim()

  return override ? override : input.defaultPath
}
