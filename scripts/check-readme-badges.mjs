import { readFileSync } from 'node:fs'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const heading = readme.split(/\r?\n/).slice(0, 12).join('\n')

const required = [
  'https://github.com/Voluma-ai/three-transform-gizmo/actions/workflows/ci.yml/badge.svg',
  'https://img.shields.io/npm/v/@voluma/three-transform-gizmo.svg',
  'https://img.shields.io/badge/demo-live-4c1.svg',
  'https://img.shields.io/github/license/Voluma-ai/three-transform-gizmo.svg',
]

const missing = required.filter((url) => !heading.includes(url))
const flattened = /^\[[A-Za-z][^\]]*\]\(/m.test(heading)
const notImages = !heading.includes('[![')

if (missing.length || flattened || notImages) {
  console.error('README heading badges must be image shields ([![name](badge)](link)).')
  if (missing.length) {
    console.error('Missing badge images:', missing.join(', '))
  }
  if (flattened || notImages) {
    console.error('Found a text link at the heading (e.g. [CI](url) instead of [![CI](badge.svg)](url)).')
  }
  process.exit(1)
}
