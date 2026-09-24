import { readFileSync } from 'node:fs'

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'),
)
const reports = ['apple', 'mlx'].map((candidate) =>
  JSON.parse(
    readFileSync(
      new URL(`./reports/${candidate}.json`, import.meta.url),
      'utf8',
    ),
  ),
)
const cell = (value) =>
  String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>')
console.log('| Block / shape | Run | Apple sentence | R2 | MLX sentence | R2 |')
console.log('|---|---:|---|---|---|---|')
for (const block of fixtures) {
  for (let run = 1; run <= 3; run++) {
    const columns = reports.flatMap((report) => {
      const row = report.rows.find(
        (row) => row.blockId === block.id && row.run === run,
      )
      return row
        ? [
            row.error ?? row.sentence,
            row.truthCheck.pass ? 'Pass' : row.truthCheck.reasons.join(', '),
          ]
        : ['Not run', '—']
    })
    console.log(
      `| ${[`${block.id} (${block.provider}): ${block.label}`, run, ...columns].map(cell).join(' | ')} |`,
    )
  }
}
