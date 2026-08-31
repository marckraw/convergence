import { get } from 'https'

interface GithubLatestReleaseResponse {
  tag_name?: unknown
  name?: unknown
}

export interface GithubLatestVersionResult {
  version: string | null
  error: string | null
}

export function fetchGithubLatestReleaseVersion(input: {
  owner: string
  repo: string
}): Promise<GithubLatestVersionResult> {
  const url = `https://api.github.com/repos/${input.owner}/${input.repo}/releases/latest`

  return new Promise((resolve) => {
    const request = get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Convergence provider status',
        },
        timeout: 5_000,
      },
      (response) => {
        const chunks: Buffer[] = []

        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            resolve({
              version: null,
              error: `GitHub releases returned HTTP ${response.statusCode ?? 'unknown'}`,
            })
            return
          }

          try {
            const body = JSON.parse(
              Buffer.concat(chunks).toString('utf8'),
            ) as GithubLatestReleaseResponse
            const rawVersion =
              typeof body.tag_name === 'string'
                ? body.tag_name
                : typeof body.name === 'string'
                  ? body.name
                  : null
            resolve({
              version: rawVersion?.replace(/^v/, '') ?? null,
              error: rawVersion
                ? null
                : 'GitHub releases response did not include a version',
            })
          } catch (error) {
            resolve({
              version: null,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to parse GitHub releases response',
            })
          }
        })
      },
    )

    request.on('timeout', () => {
      request.destroy(new Error('GitHub releases request timed out'))
    })

    request.on('error', (error) => {
      resolve({ version: null, error: error.message })
    })
  })
}
