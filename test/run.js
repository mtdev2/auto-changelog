const test = require('tape')
const { join } = require('path')
const { readFile } = require('../src/utils')
const remotes = require('./data/remotes')
const releases = require('./data/releases')
const { tags } = require('./data/commits-map')
const {
  run,
  __get__,
  __Rewire__: mock,
  __ResetDependency__: unmock
} = require('../src/run')

const getOptions = __get__('getOptions')

function setup () {
  mock('fileExists', () => false)
  mock('readJson', () => null)
  mock('fetchRemote', () => remotes.github)
  mock('fetchTags', () => Promise.resolve(tags))
  mock('parseReleases', () => Promise.resolve(releases))
  mock('writeFile', () => {})
  mock('log', () => {})
}

function teardown () {
  unmock('fileExists')
  unmock('readJson')
  unmock('fetchRemote')
  unmock('fetchTags')
  unmock('parseReleases')
  unmock('writeFile')
  unmock('log')
}

test('getOptions: parses commit limit correctly', async t => {
  const options = await getOptions(['', '', '--commit-limit', '10'])
  t.equal(options.commitLimit, 10)
})

test('getOptions: parses false commit limit correctly', async t => {
  const options = await getOptions(['', '', '--commit-limit', 'false'])
  t.equal(options.commitLimit, false)
})

test('getOptions: parses --issue-url correctly when given --issue-url', async t => {
  const options = await getOptions(['', '', '--issue-url', 'https://test.issue.local/issues/{id}'])
  t.equal(options.issueUrl, 'https://test.issue.local/issues/{id}')
})

test('getOptions: parses -i correctly when given -i', async t => {
  const options = await getOptions(['', '', '-i', 'https://test.issue.local/issues/{id}'])
  t.equal(options.issueUrl, 'https://test.issue.local/issues/{id}')
})

test('getOptions: autodetects a monorepo via repository.directory and derives the tag prefix', async t => {
  mock('readJson', file => (file === 'package.json'
    ? { name: 'my-package', repository: { directory: 'packages/my-package' }, 'auto-changelog': { autodetectMonorepoDisabled: false } }
    : null))
  try {
    const options = await getOptions(['', ''])
    t.equal(options.tagPrefix, 'my-package@')
    t.equal(options.stripTagPrefix, true)
  } finally {
    unmock('readJson')
  }
})

test('getOptions: autodetects a monorepo via an ancestor workspaces field', async t => {
  mock('readJson', file => {
    if (file === 'package.json') return { name: 'my-package', 'auto-changelog': { autodetectMonorepoDisabled: false } }
    if (file.endsWith('package.json')) return { workspaces: ['packages/*'] }
    return null
  })
  try {
    const options = await getOptions(['', ''])
    t.equal(options.tagPrefix, 'my-package@')
    t.equal(options.stripTagPrefix, true)
  } finally {
    unmock('readJson')
  }
})

test('getOptions: does not override an explicitly configured tag prefix', async t => {
  mock('readJson', file => (file === 'package.json'
    ? { name: 'my-package', repository: { directory: 'packages/my-package' }, 'auto-changelog': { autodetectMonorepoDisabled: false, tagPrefix: 'custom/' } }
    : null))
  try {
    const options = await getOptions(['', ''])
    t.equal(options.tagPrefix, 'custom/')
    t.equal(options.stripTagPrefix, true)
  } finally {
    unmock('readJson')
  }
})

test('getOptions: does not autodetect when the package is not in a monorepo', async t => {
  mock('readJson', file => (file === 'package.json'
    ? { name: 'my-package', 'auto-changelog': { autodetectMonorepoDisabled: false } }
    : null))
  try {
    const options = await getOptions(['', ''])
    t.equal(options.tagPrefix, '')
    t.notOk(options.stripTagPrefix)
  } finally {
    unmock('readJson')
  }
})

test('getOptions: does not autodetect a monorepo by default', async t => {
  mock('readJson', file => (file === 'package.json'
    ? { name: 'my-package', repository: { directory: 'packages/my-package' } }
    : null))
  try {
    const options = await getOptions(['', ''])
    t.equal(options.autodetectMonorepoDisabled, true)
    t.equal(options.tagPrefix, '')
    t.notOk(options.stripTagPrefix)
  } finally {
    unmock('readJson')
  }
})

test('run: generates a changelog', async t => {
  setup()
  try {
    const expected = await readFile(join(__dirname, 'data', 'template-compact.md'))

    mock('writeFile', (output, log) => {
      t.equal(output, 'CHANGELOG.md')
      t.equal(log, expected)
    })

    await run(['', ''])
  } finally {
    teardown()
  }
})

test.skip('run: generates a changelog with no remote', async t => {
  setup()
  try {
    const expected = await readFile(join(__dirname, 'data', 'template-compact-no-remote.md'))

    mock('fetchRemote', () => remotes.null)
    mock('fetchCommits', () => require('./data/commits-no-remote'))
    mock('writeFile', (output, log) => {
      t.equal(output, 'CHANGELOG.md')
      t.equal(log, expected)
    })

    await run(['', ''])
  } finally {
    teardown()
  }
})

test('run: uses options from package.json', async t => {
  setup()
  try {
    const expected = await readFile(join(__dirname, 'data', 'template-keepachangelog.md'))

    mock('fileExists', () => true)
    mock('readJson', () => ({
      'auto-changelog': {
        template: 'keepachangelog'
      }
    }))
    mock('writeFile', (output, log) => {
      t.equal(output, 'CHANGELOG.md')
      t.equal(log, expected)
    })

    await run(['', ''])
  } finally {
    teardown()
  }
})

test.skip('run: uses version from package.json', async t => {
  setup()
  try {
    mock('fileExists', () => true)
    mock('readJson', () => ({
      version: '2.0.0'
    }))
    mock('writeFile', (output, log) => {
      t.ok(log.includes('v2.0.0'))
    })

    await run(['', '', '--package'])
  } finally {
    teardown()
  }
})

test.skip('run: uses version from custom package file', async t => {
  setup()
  try {
    mock('fileExists', () => true)
    mock('readJson', file => {
      if (file === 'test.json') {
        return { version: '2.0.0' }
      }
      return {}
    })
    mock('writeFile', (output, log) => {
      t.ok(log.includes('v2.0.0'))
    })

    await run(['', '', '--package', 'test.json'])
  } finally {
    teardown()
  }
})

test.skip('run: uses version from package.json with no prefix', async t => {
  setup()
  try {
    mock('fileExists', () => true)
    mock('readJson', () => ({
      version: '2.0.0'
    }))
    mock('fetchTags', () => Promise.resolve(tags.map(tag => tag.replace('v', ''))))
    mock('writeFile', (output, log) => {
      t.ok(log.includes('2.0.0'))
      t.ok(!log.includes('v2.0.0'))
    })

    await run(['', '', '--package'])
  } finally {
    teardown()
  }
})

test('run: command line options override options from package.json', async t => {
  setup()
  try {
    mock('fileExists', path => path === '.auto-changelog')
    mock('readJson', () => ({
      'auto-changelog': {
        output: 'should-not-be-this.md'
      }
    }))
    mock('writeFile', (output, log) => {
      t.equal(output, 'should-be-this.md')
    })

    await run(['', '', '--output', 'should-be-this.md'])
  } finally {
    teardown()
  }
})

test('run: uses options from .auto-changelog', async t => {
  setup()
  try {
    const expected = await readFile(join(__dirname, 'data', 'template-keepachangelog.md'))
    mock('fileExists', path => path === '.auto-changelog')
    mock('readJson', path => {
      return path === '.auto-changelog' ? { template: 'keepachangelog' } : null
    })
    mock('writeFile', (output, log) => {
      t.equal(log, expected)
    })

    await run(['', ''])
  } finally {
    teardown()
  }
})

test('run: command line options override options from .auto-changelog', async t => {
  setup()
  try {
    mock('fileExists', path => path === '.auto-changelog')
    mock('readJson', (path) => {
      return path === '.auto-changelog' ? { output: 'should-not-be-this.md' } : null
    })
    mock('writeFile', (output, log) => {
      t.equal(output, 'should-be-this.md')
    })

    await run(['', '', '--output', 'should-be-this.md'])
  } finally {
    teardown()
  }
})

test.skip('run: supports unreleased option', async t => {
  setup()
  try {
    mock('writeFile', (output, log) => {
      t.ok(log.includes('Unreleased'))
      t.ok(log.includes('https://github.com/user/repo/compare/v1.0.0...HEAD'))
    })
    await run(['', '', '--unreleased'])
  } finally {
    teardown()
  }
})

test.skip('run: supports breakingPattern option', async t => {
  setup()
  try {
    const { commitsMap } = require('./data/commits-map')
    const addBreakingFlag = commit => {
      if (/Some breaking change/.test(commit.message)) {
        return { ...commit, breaking: true }
      }
      return commit
    }
    mock('fetchCommits', diff => Promise.resolve(commitsMap[diff].map(addBreakingFlag)))
    mock('writeFile', (output, log) => {
      t.ok(log.includes('**Breaking change:** Some breaking change'))
    })
    // No need to actually pass in the option here as we amend the commits
    await run(['', '', '--commit-limit', '0'])
  } finally {
    teardown()
  }
})

test.skip('run: supports releaseSummary option', async t => {
  setup()
  try {
    mock('writeFile', (output, log) => {
      t.ok(log.includes('This is my major release description.\n\n- And a bullet point'))
    })
    await run(['', '', '--release-summary'])
  } finally {
    teardown()
  }
})

test('run: does not error when using latest version option', async t => {
  setup()
  try {
    await run(['', '', '--latest-version', 'v3.0.0'])
    t.pass('did not error')
  } finally {
    teardown()
  }
})

// For some reason is preventing the fetchTags test from running…?`
test.skip('run: does not error when using stdout option', async t => {
  setup()
  try {
    await run(['', '', '--stdout'])
    t.pass('did not error')
  } finally {
    teardown()
  }
})

test('run: throws an error when no package found', t => {
  setup()
  return run(['', '', '--package'])
    .then(() => t.fail('Should throw an error'))
    .catch(() => t.pass('threw'))
    .finally(teardown)
})

test('run: throws an error when no custom package found', t => {
  setup()
  return run(['', '', '--package', 'does-not-exist.json'])
    .then(() => t.fail('Should throw an error'))
    .catch(() => t.pass('threw'))
    .finally(teardown)
})

test('run: throws an error when no template found', t => {
  setup()
  return run(['', '', '--template', 'not-found'])
    .then(() => t.fail('Should throw an error'))
    .catch(() => t.pass('threw'))
    .finally(teardown)
})
