
/* eslint-disable max-lines-per-function */
/* eslint-disable max-statements */
/* eslint-disable one-var */
const _ = require('lodash');
const fs = require('fs');
const fsRecursive = require('recursive-readdir');

let vscode = null;
try { // try and catch to also allow it to be used by the cli function
  vscode = require('vscode');
} catch (err) {
  // dont care for now
}
const makefileTemplate = require('./makefileTemplate');

const generatorString = 'Generated by STM32 for VSCode';

async function extractMakeFileInfo(makefilePath) {
  /*
   * Should extract the following information
   * target
   * cpu
   * fpu
   * float-abi
   * mcu
   * c sources
   * cpp sources
   * asm sources
   * asm definitions
   * c definitions
   * as includes
   * c includes
   * linkerscript???
   * if generated by cubemx or stm32 for vscode
  */

  return new Promise((resolve, reject) => {
    fs.readFile(makefilePath, { encoding: 'utf8' }, (err, data) => {
      if (err) {
        reject(err);
      }
      // extract all the info of the current make file.
      let freshFile = true;

      if (data.indexOf(generatorString) >= 0) {
        freshFile = false;
      }
      const info = {
        freshFile,
        target: extractSingleLineInfo('target', data),
        cpu: extractSingleLineInfo('cpu', data),
        fpu: extractSingleLineInfo('fpu', data),
        floatAbi: extractSingleLineInfo('float-abi', data),
        mcu: extractSingleLineInfo('mcu', data),
        linkerScript: extractSingleLineInfo('ldscript', data),
        cSources: extractMultiLineInfo('c_sources', data),
        cppSources: extractMultiLineInfo('cpp_sources', data),
        asmSources: extractMultiLineInfo('asm_sources', data),
        cDefinitions: extractMultiLineInfo('c_defs', data),
        cppDefinitions: extractMultiLineInfo('cpp_defs', data),
        asmDefinitions: extractMultiLineInfo('as_defs', data),
        cIncludes: extractMultiLineInfo('c_includes', data),
        cppIncludes: extractMultiLineInfo('cpp_includes', data),
        asmIncludes: extractMultiLineInfo('as_includes', data),
        makefile: data,
        path: makefilePath,
      };
      _.set(info, 'targetMCU', getTargetSTM(info.cSources));
      if (!info.targetMCU) {
        if (vscode) {
          vscode.window.showWarningMessage('The xxx_hal_msp.c file is not present, please initialize the project with cubeMX with separate .c and .h files');
        } else {
          console.error('The xxx_hal_msp.c file is not present, please initialize the project with cubeMX with separate .c and .h files');
        }
      }
      resolve(info);
    });
  });
}

function extractSingleLineInfo(name, data) {
  const newPatt = new RegExp(`${name}\\s=\\s(.*)`, 'gmi'),
    newRes = newPatt.exec(data);

  return _.last(newRes);
}

function extractMultiLineInfo(name, data) {
  const splitData = data.split(/\r\n|\r|\n/),
    startPattern = new RegExp(`${name}\\s=\\s`, 'gmi'),
    // const endPattern = new RegExp('^-?[a-z].*\\$', 'gim');
    endPattern = /^-?[a-z].*\b$/gim,
    emptyPattern = /^(\s*)$/gim;
  let end = 0,
    start = 0;
  const cleanStrings = [];

  _.map(splitData, (line, ind) => {
    if (start && !end) {
      if (emptyPattern.test(line)) {
        end = parseInt(ind);
        return;
      }
      cleanStrings.push(line.replace(/(\s\\$)|(\s.$)/gim, ''));
      if (endPattern.test(line)) {
        end = parseInt(ind);
      }
    }
    if (startPattern.test(line)) {
      start = parseInt(ind);
    }
  });

  return cleanStrings;
}

async function extractFileTypes(workspacePath) {
  /*
   * Should get:
    - Makefile
    - c source
    - cpp sources
    - asm source
    - linker script
    - c includes
  */
  return listFiles(workspacePath).then((fileList) => {
    const output = {
      makefile: '',
      linkerScript: extracType(fileList, 'ld'),
      cSources: extracType(fileList, 'c'),
      cppSources: extracType(fileList, 'cpp'),
      asmSources: extracType(fileList, 's'),
      cIncludes: extracType(fileList, 'h'),
    };

    // make file has no extension so should be done seperately
    _.forEach(fileList, (item) => {
      const fileName = item.split('/').pop();

      if (_.toLower(fileName) === 'makefile') {
        output.makefile = item;
      }
    });
    if (_.isArray(output.linkerScript)) {
      output.linkerScript = _.first(output.linkerScript);
    }
    return output;
  }).catch(err => new Error('something went wrong while retrieving the file list in your workspace', err));
}


function extracType(fileList, type) {
  const list = [];

  _.forEach(fileList, (item) => {
    const extension = item.split('.').pop();

    if (extension === type) {
      list.push(item);
    }
  });
  return list;
}

/* Function for getting the target STM device e.g. STM32
 *
*/
function getTargetSTM(cFiles) {
  const regPattern = /(.*\/)?(.*)x_hal_msp.c/i;
  let output = '';
  _.map(cFiles, (fileName) => {
    if (regPattern.test(fileName)) {
      const regOut = regPattern.exec(fileName);
      output = _.last(regOut);
    }
  });
  return output;
}


/*
 * Returns an array of all the files in the workspace folder.
*/
function listFiles(path) {
  return new Promise((resolve, reject) => {
    fsRecursive(path, (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(files);
    });
  });
}

module.exports = {
  extractMakeFileInfo,
  extractFileTypes,
  listFiles,
};