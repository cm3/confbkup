/*

.list: list of pathes you want to backup from
data: directory you want to backup to

- Backup all
- Restore all
- Restore selected
- Exit

*/

"use strict";

let listfile = ".list"
let backupdir = "./data"
let filenames = []; //filenames to process in restore

const term = require('terminal-kit').terminal;
const diff = require('diff');
const fs = require('fs');
const Promise = require('promise');
const packageinfo = require('./package.json');
term.timeout=1000; //avoid "Error: .getCursorLocation() timed out"

const waitSpace = function(_msg,_func){
    term.cyan("\n"+_msg+"\n");
    term.yesOrNo({yes:[' ']}, function(error, result){
        if(result){setTimeout(_func,200);} //avoid rapid-fire
    });
}

const showMenu = function(){
    //console.log('\x1Bc');
    term.clear();
    term.cyan("\n** "+packageinfo.name+" "+packageinfo.version+" **\n"+packageinfo.description+"\n");
    term.cyan("Set the list of files you want to backup in the \'"+listfile+"\' file first.\n");
    term.singleColumnMenu(["- Backup all","- Restore all","- Restore selected","- Exit"], function(err, res){
        if (err) {
            console.log("error in singleColumnMenu");
            console.log(err.stack);
            return false;
        }
        else{
            if(res.selectedText == "- Backup all"){
                const backupPromises = backupAll(
                    (promises)=>
                    Promise.all(promises).then(
                        ()=>
                        waitSpace("Press SPACE to go back to the menu.",showMenu)
                    )
                );
                //console.log(backupPromises);
                //process.exit(0);
                //setTimeout(()=>process.exit(0),200)
                //Promise.all(backupPromises).then(()=>waitSpace("Press SPACE to go back to the menu.",showMenu));
            }else if(res.selectedText == "- Restore all"){
                restoreAll();
            }else if(res.selectedText == "- Restore selected"){
                restoreSelected();
            }else if(res.selectedText == "- Exit"){
                term.clear();
                process.exit(0);
            }
        }
    });
}

const backupAll = function(_callback){
    fs.readFile(listfile, 'utf8', (err, data) => {
        if (err) {
        //throw err;
        console.log(err.stack);
        return false;
        }
        term.clear();
        let path = data.split(/\r\n|\r|\n/);
        let promises = [];
        for(let p of path){
            if(p != ""){
                promises.push(copy(p,backupdir+"/"+p.replace(/\//g,"!")));
            }
        }
        _callback(promises);
    });
}

const copy = function(src, dest) {
  return new Promise((resolve,reject)=>{
    // copied from https://qiita.com/SFPGMR/items/e6a65c4839d4433c7f55 and modified.
    // all results are "resolve" because even if any copying failed,
    // you may expect the program keep running with error message
    var r = fs.createReadStream(src)
            .on("error",(err)=>{console.log(err.stack);resolve()}),
        w = fs.createWriteStream(dest)
            .on("error",(err)=>{console.log(err.stack);resolve();})
            .on("close",()=>{console.log("Backup: "+src+" -> "+dest);resolve();});
    r.pipe(w);
  });
}

const restoreAll = function(){
    fs.readdir(backupdir, function(err, files){
        if (err){
            console.log(err.stack);
            return false;
        }else{
            let fileList = files.filter(function(file){
                return fs.statSync(backupdir+'/'+file).isFile();
            })
            if(fileList.length == 0){
                term.red("\nbackup data is empty. backup first.\n");
                setTimeout(showMenu, 1000);
            }else{
                filenames = JSON.parse(JSON.stringify(fileList)); //deep copy
                processFile();
            }
        }
    });
}

const restoreSelected = function(){
    fs.readdir(backupdir, function(err, files){
        if (err){
            console.log(err.stack);
            return false;
        }else{
            let fileList = files.filter(function(file){
                return fs.statSync(backupdir+'/'+file).isFile();
            })
            if(fileList.length == 0){
                term.red("\nbackup data is empty. backup first.\n");
                setTimeout(showMenu, 1000);
            }else{
                term.clear();
                term.cyan('\nSelect backup file:\n');
                fileList.unshift("< Back to menu");
                term.singleColumnMenu(fileList, function(err, res){
                    if (err) {
                        console.log("error in singleColumnMenu");
                        console.log(err.stack);
                        return false;
                    }
                    else{
                        if(res.selectedText == "< Back to menu"){
                            showMenu();
                        }else{
                            filenames = [res.selectedText];
                            processFile();
                        }
                    }
                });
            }
        }
    });
}

const readFile = function(_fn, _ondata){
    fs.readFile(_fn, 'utf8', (err, data) => {
        if (err) {console.log(err.stack);}
        else{_ondata(data);}
    });
}

const askForRestore = function(_backupPath, _originalPath){
    term('Do you want to restore backup file? [y|N]\n');
    // restore on y, yes
    term.yesOrNo( { yes: [ 'y' ] , no: [ 'n', 'ENTER' ] } , function( error , result ) {
        if (result){
            fs.copyFile(_backupPath, _originalPath, (err) => {
                if (err) {
                    term.red(err.stack);
                    waitSpace("Press SPACE to go next.",processFile);
                    return false;
                }
                else {
                    term.green("\nThe backup file is restored!\n");
                    waitSpace("Press SPACE to go next.",processFile);
                    return true;
                }
            });
        }else{
            console.log("\nOK, you keep the original file.\n") ;
            waitSpace("Press SPACE to go next.",processFile);
            return true;
        }
    });
}

const processFile = function(){
    if(filenames.length == 0){
        showMenu();
        return false;
    }
    term.clear();
    const fn = filenames.shift();
    const backupPath = './data/'+fn;
    const originalPath = fn.replace(/\!/g,"/");
    let backupStr = "";
    let originalStr = "";
    const showPatch = function(){
        const patch = diff.createTwoFilesPatch(originalPath, backupPath, originalStr, backupStr, "current", "backup");
        console.log(patch);
    }
    //read 2 files and when both are ready, go next.
    //ToDo: use Promise.all instead lol
    let finishedCount = 0;
    readFile(backupPath,function(_data){
        backupStr = _data;
        finishedCount += 1;
        if(finishedCount == 2){
            showPatch();
            askForRestore(backupPath, originalPath);
        }
    });
    readFile(originalPath,function(_data){
        originalStr = _data;
        finishedCount += 1;
        if(finishedCount == 2){
            showPatch();
            askForRestore(backupPath, originalPath);
        }
    });
}

showMenu();
