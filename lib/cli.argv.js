module.exports = {
  suite: {
    alias: 'S',
    demand: true,
    describe: 'Suite to run, lives in your patatafile',
    group: 'Obligatory:'
  },
  capability: {
    alias: 'c',
    demand: false,
    describe: 'Platform version: "android19" or "ios81"',
    group: 'Optional arguments:'
  },
  components: {
    alias: 'C',
    array: true,
    demand: false,
    describe: 'Path to definitions of elements inside the test app',
    group: 'Optional arguments:'
  },
  features: {
    alias: 'f',
    array: true,
    demand: false,
    describe: 'Cucumber tags, paths to files or scenario names',
    group: 'Optional arguments:'
  },
  provider: {
    alias: 'p',
    demand: false,
    describe: 'Relative path to the app binary',
    group: 'Optional arguments:'
  },
  include: {
    alias: 'i',
    array: true,
    demand: false,
    describe: 'Arbitrary modules you want to require',
    group: 'Optional arguments:'
  },
  servers: {
    alias: 's',
    array: true,
    demand: false,
    describe: 'Hostname:port of the appium instance you wish to use',
    group: 'Optional arguments:'
  },
  reports: {
    alias: 'r',
    array: true,
    demand: false,
    describe: 'Report format you wish to expose',
    group: 'Optional arguments:'
  }
}
