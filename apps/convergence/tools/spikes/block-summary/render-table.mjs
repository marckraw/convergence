import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { blockFacts, formatBlockFacts } from './luna-facts.pure.ts'

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'),
)
const cell = (value) =>
  String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>')
if (process.argv[2] === 'luna') {
  renderLuna()
} else {
  renderOnDevice()
}

function renderOnDevice() {
  const reports = ['apple', 'mlx'].map((candidate) =>
    JSON.parse(
      readFileSync(
        new URL(`./reports/${candidate}.json`, import.meta.url),
        'utf8',
      ),
    ),
  )
  console.log(
    '| Block / shape | Run | Apple sentence | R2 | MLX sentence | R2 |',
  )
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
}

function renderLuna() {
  const efforts = ['low', 'medium', 'high']
  const marksPath = new URL('./reports/luna-marks.json', import.meta.url)
  const marks = existsSync(marksPath)
    ? JSON.parse(readFileSync(marksPath, 'utf8'))
    : {}
  const lines = [
    '# GPT-6 Luna work-block sentences',
    '',
    'First-pass marks are an aid. `supported` means the sentence stays inside the fixture. `claims more than the facts` quotes the words that go past them.',
    '',
  ]
  for (const effort of efforts) {
    const reportPath = new URL(`./reports/luna-${effort}.json`, import.meta.url)
    if (!existsSync(reportPath)) {
      lines.push(`## ${effort}`, '', 'Not run.', '')
      continue
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    const supported = report.rows.filter((row) => {
      const mark = marks[`${effort}/${row.blockId}/run-${row.run}`]
      return mark?.mark === 'supported'
    }).length
    const summary = report.summary
    lines.push(
      `## ${effort}`,
      '',
      `${summary.truthPassCount ?? 0}/60 lexical pass · ${supported}/60 marked supported · p50 ${summary.warmP50Ms == null ? 'n/a' : Math.round(summary.warmP50Ms)} ms`,
      '',
      `First call ${summary.coldFirstCallMs == null ? 'n/a' : Math.round(summary.coldFirstCallMs)} ms. Warm p95 ${summary.warmP95Ms == null ? 'n/a' : Math.round(summary.warmP95Ms)} ms. Responses ${summary.responses}/60. Errors ${summary.responses - summary.successfulResponses}.`,
      '',
      '| Block | Run | Facts | Sentence | Lexical | Mark |',
      '|---|---:|---|---|---|---|',
    )
    for (const block of fixtures) {
      const facts = formatBlockFacts(blockFacts(block))
      for (let run = 1; run <= 3; run++) {
        const row = report.rows.find(
          (item) => item.blockId === block.id && item.run === run,
        )
        const mark = marks[`${effort}/${block.id}/run-${run}`]
        const sentence = row?.error ?? row?.sentence ?? 'Not run'
        const lexical = !row
          ? '—'
          : row.error
            ? 'error'
            : row.truthCheck.pass
              ? 'Pass'
              : row.truthCheck.reasons.join(', ')
        const judgment = row?.error
          ? 'error'
          : mark
            ? mark.mark === 'supported'
              ? 'supported'
              : `claims more than the facts: ${mark.quote}`
            : 'unreviewed'
        lines.push(
          `| ${[
            `${block.id} (${block.provider}): ${block.label}`,
            run,
            facts,
            sentence,
            lexical,
            judgment,
          ]
            .map(cell)
            .join(' | ')} |`,
        )
      }
    }
    lines.push('')
  }
  const markdown = `${lines.join('\n')}\n`
  writeFileSync(new URL('./reports/luna-table.md', import.meta.url), markdown)
  console.log(markdown)
}
