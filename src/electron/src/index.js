// DreamTime.
// Copyright (C) DreamNet. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License 3.0 as published by
// the Free Software Foundation. See <https://www.gnu.org/licenses/gpl-3.0.html>
//
// Written by Ivan Bravo Bravo <ivan@dreamnet.tech>, 2019.

import { app, BrowserWindow } from 'electron'
import http from 'http'
import path from 'path'
import { URL } from 'url'
import fs from 'fs-extra'
import contextMenu from 'electron-context-menu'
import { pack, enforceMacOSAppLocation } from 'electron-utils'

import { AppError } from './modules/app-error'
import { settings, nucleus, rollbar } from './modules/services'
import { system } from './modules/tools'
import config from '~/nuxt.config'

const logger = require('logplease').create('electron')

// NuxtJS root directory
config.rootDir = path.dirname(__dirname)

// copyright

console.log(`
DreamTime.
Copyright (C) DreamNet. All rights reserved.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License 3.0 as published by
the Free Software Foundation. See <https://www.gnu.org/licenses/gpl-3.0.html>
`)

logger.info('Starting...')

logger.debug({
  env: process.env.NODE_ENV,
  isStatic: pack.isStatic(),
  paths: {
    appPath: app.getAppPath(),
    exePath: app.getPath('exe'),
  },
})

class DreamApp {
  /**
   * Start the app!
   */
  static async start() {
    await this.setup()

    this.createWindow()
  }

  /**
   * Prepare the application.
   */
  static async setup() {
    // https://electronjs.org/docs/tutorial/notifications#windows
    app.setAppUserModelId(process.execPath)

    // https://github.com/sindresorhus/electron-util#enforcemacosapplocation-macos
    enforceMacOSAppLocation()

    // macos activate.
    app.on('activate', () => {
      this.createWindow()
    })

    // application exit.
    app.on('will-quit', async (event) => {
      event.preventDefault()

      await this.shutdown()

      app.exit()
    })

    // system stats.
    await system.setup()

    // user settings.
    await settings.setup()

    // analytics.
    await nucleus.setup()

    // bug tracking.
    await rollbar.setup()

    // requirements.
    await system.scan()

    // todo: updates

    //
    this.createDirs()

    //
    contextMenu({
      showSaveImageAs: true,
    })
  }

  /**
   *
   */
  static async shutdown() {
    await rollbar.shutdown()
  }

  /**
   * Create the program window and load the interface
   */
  static createWindow() {
    // browser window.
    this.window = new BrowserWindow({
      width: 1200,
      height: 700,
      minWidth: 1200,
      minHeight: 700,
      icon: path.join(config.rootDir, 'dist', 'icon.ico'),
      webPreferences: {
        nodeIntegration: false,
        preload: path.join(app.getAppPath(), 'electron', 'dist', 'provider.js'),
      },
    })

    // disable menu
    this.window.setMenu(null)

    // ui location
    this.uiUrl = this.getUiUrl()

    if (config.dev) {
      this.pollUi()
    } else {
      this.window.loadFile(this.uiUrl)
    }

    if (process.env.DEVTOOLS) {
      // devtools
      this.window.webContents.openDevTools()
    }
  }

  /**
   * Wait until the NuxtJS server is ready.
   */
  static pollUi() {
    logger.debug(`Requesting status from the server: ${this.uiUrl}`)

    http
      .get(this.uiUrl, (response) => {
        if (response.statusCode === 200) {
          logger.debug('Server ready, dream time!')
          this.window.loadURL(this.uiUrl)
        } else {
          logger.warn(`The server reported: ${response.statusCode}`)
          setTimeout(this.pollUi.bind(this), 300)
        }
      })
      .on('error', (error) => {
        logger.warn('Poll error', error)
        setTimeout(this.pollUi.bind(this), 300)
      })
  }

  /**
   * Returns the url of the user interface
   *
   * @return {string}
   */
  static getUiUrl() {
    if (!config.dev) {
      return path.join(config.rootDir, 'dist', 'index.html')
    }

    return `http://localhost:${config.server.port}`
  }

  /**
   * Create required directories.
   */
  static createDirs() {
    const modelsPath = path.join(settings.folders.models, 'Uncategorized')

    if (!fs.existsSync(modelsPath)) {
      fs.mkdirSync(modelsPath, { recursive: true },
        (error) => {
          throw new AppError(`Models directory creation fail.`, { error })
        })
    }
  }
}

process.on('uncaughtException', (err) => {
  logger.warn('Unhandled exception!', err)
  AppError.handle(err)

  return true
})

process.on('unhandledRejection', (err) => {
  logger.warn('Unhandled rejection!', err)
  AppError.handle(err)

  return true
})

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)

    console.log(parsedUrl)

    /**
    if (parsedUrl.origin !== 'https://example.com') {
      event.preventDefault()
    }
    * */
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('ready', async () => {
  try {
    await DreamApp.start()
  } catch (error) {
    throw new AppError(error, { title: `Failed to start correctly.` })
  }
})
