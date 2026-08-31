import { get } from 'https'

interface NpmLatestResponse {
  version?: unknown
}

export interface NpmLatestVersionResult {
  version: string | null
  error: string | null
}

export function fetchNpmLatestVersion(
  packageName: string,
): Promise<NpmLatestVersionResult> {
  const encodedPackageName = encodeURIComponent(packageName)
  const url = `https://registry.npmjs.org/${encodedPackageName}/latest`

  return new Promise((resolve) => {
    const request = get(
      url,
      {
        headers: {
          Accept: 'application/json',
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
              error: `npm registry returned HTTP ${response.statusCode ?? 'unknown'}`,
            })
            return
          }

          try {
            const body = JSON.parse(
              Buffer.concat(chunks).toString('utf8'),
            ) as NpmLatestResponse
            resolve({
              version: typeof body.version === 'string' ? body.version : null,
              error:
                typeof body.version === 'string'
                  ? null
                  : 'npm registry response did not include a version',
            })
          } catch (error) {
            resolve({
              version: null,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to parse npm registry response',
            })
          }
        })
      },
    )

    request.on('timeout', () => {
      request.destroy(new Error('npm registry request timed out'))
    })

    request.on('error', (error) => {
      resolve({ version: null, error: error.message })
    })
  })
}
