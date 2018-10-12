const fs = require('fs');
const path = require('path');
const loaderUtils = require("loader-utils");

const default_options = {
    isLayout: true,
    layoutPlaceholder: '{{__content__}}', //layout占位符
    layoutPath: "", //如果相对链接没找到，最后会找这个layout文件
    excludeDir: "/upload/", //图片不需要转换的路径
    imgAttr: "both" //分别有src、data-src、和both，both表示2个都转换
};
let g_self = null;
module.exports = function(source) {
    this.cacheable && this.cacheable();
    
    g_self = this;
    let opts = Object.assign(default_options, loaderUtils.parseQuery(this.query));
    if(/module\.exports\s?=/.test(source)) {
        source = source.replace(/module\.exports\s?=\s?/, '');
    }

    //返回layout内容
    source =  layoutReturn.call(this, source, opts);
    source =  replaceData(source, opts, path.dirname(this.resourcePath));

    /*let exportsString = "module.exports = ";
    if (opts.exportAsDefault) {
        exportsString = "exports.default = ";

    } else if (opts.exportAsEs6Default) {
        exportsString = "export default ";
    }
    return exportsString + JSON.stringify(source);*/
    return source;
};
//引入Include页面和渲染里面的data
function replaceData(content, opts, dirPath) {
    let reg = /@\{include\([^)]*\)\}/g;
    
    let source = content.replace(reg, function(match) {
        return replace(match, dirPath, opts);
    });
    return source;
}

//引入和替换数据
function replace(match, dirPath, opts) {
    let reg = /@\{include\([^)]*\)\}/g;
    let regLeft = /@\{include\(/g;
    let regLast = /\)\}$/g
    let regOpt = /\{[^\}]*\}/g;

    let filePath = "";
    let fileData = "";
    let res = match.replace(regLeft, "").replace(regLast, "");
    let option = res.match(regOpt) ? JSON.parse(res.match (regOpt)[0]) : null;
    let filePathStr = res.replace(regOpt, "").replace(",", "").replace(/"/g, "").replace(/\s/g, "");
    filePath = path.resolve(dirPath, filePathStr);


    if (fsExistsSync(filePath)) {
      fileData = fs.readFileSync(filePath, {encoding: "utf-8"});

      for (key in option) {
        fileData = fileData.replace(new RegExp("@@{" + key + "}","g"), option[key]);
      }
      fileData = replaceImgSrc(fileData, opts.excludePath, path.dirname(filePath), opts);

      if (reg.test(fileData)) {
            fileData = replaceData(fileData, opts, path.dirname(filePath));
      }
    }
    else {
        fileData = "include的文件"+ filePath + "不存在，请查看路径是否正确";
    }
    return fileData;

}

//处理layout的返回内容
function layoutReturn(source, opts) {
    //如果没启用layout，那么直接返回原内容
    if (!opts.isLayout) {
        return source;
    }
    //开始检查layout
    var regLayout = new RegExp(`(@layout\\()(.*?)\\)`);
    var regLayoutResult = regLayout.exec(source);
    var layoutHtml = "";
    if (regLayoutResult) {
        let currentPath = path.resolve(this.resourcePath, "../", regLayoutResult[2]);
        source = source.replace(regLayoutResult[0], '');
        if (fsExistsSync(currentPath)) {
            layoutHtml = layoutRender(currentPath, opts.layoutPlaceholder, source, opts);
        }
        else {
            try {
                fs.accessSync(opts.layoutPath);
                layoutHtml = layoutRender(opts.layoutPath, opts.layoutPlaceholder, source, opts);
            }
            catch(error) {
                throw error;
            }
        }
      } else {
        layoutHtml = source;
      }
      return layoutHtml;
}
//读取layout内容然后插入到页面返回
function layoutRender(layoutPath, layoutPlaceholder, source, opts) {
    try {
        var layoutHtml = fs.readFileSync(layoutPath, 'utf-8');
      } catch (error) {
        throw error
      }
      layoutHtml = replaceImgSrc(layoutHtml, opts.excludePath, path.dirname(layoutPath), opts);
      return layoutHtml.replace(layoutPlaceholder, source);
}

function replaceImgSrc(source, exclude, dirPath, opts) {
    var dirPath = dirPath || "";
    //var regImg = /((\<img[^\<\>]*? src)|(\<img[^\<\>]*? src)|(\<link[^\<\>]*? href))[\s]*=[\s]*\\?[\"\']?[^\'\"\<\>\+]+?\\?[\'\"][^\<\>]*?[/]?\>/ig;
    var regImg = /((\<img[^\<\>]*? data-src)|(\<img[^\<\>]*? src)|(\<link[^\<\>]*? href))[\s]*=[\s]*\\?[\"\']?[^\'\"\<\>\+]+?\\?[\'\"][^\<\>]*?[/]?\>/ig;

    var source = source.replace(regImg, function(str){
        var imgJson = imgHtml2json(str);
        switch(opts.imgAttr) {
            case "both":

                imgJson.src = imgJson.src ? loaderUtils.stringifyRequest(g_self, path.resolve(dirPath, imgJson.src)) : "";
                imgJson.data$src = imgJson.data$src ? loaderUtils.stringifyRequest(g_self, path.resolve(dirPath, imgJson.data$src)) : "";
            break;
            case "data-src":
                imgJson.data$src = imgJson.data$src ? loaderUtils.stringifyRequest(g_self, path.resolve(dirPath, imgJson.data$src)) : "";
            break;
            case "src":
                imgJson.src = imgJson.src ? loaderUtils.stringifyRequest(g_self, path.resolve(dirPath, imgJson.src)) : "";
            break;
        }
        return imgJson2html(imgJson);

    });
    return source;
}

//把Img的属性转为json，注意没有等号的如disabled不会保留,值为空也不会保留
function imgHtml2json(html) {
    var m = html.match(/((\w+-?\w?)+\s*=\s*['"]?\s*[^"']+\s*)/g);
    var obj = {};
    if (m && m.length) {
        for (var i = m.length; i--; ) {
            let arr = m[i].split("=");
            let name = arr[0].replace(/\s/g, "").replace(/-/g, "$");
            let value = arr[1].replace(/\s/g, "").replace(/['"]/g, "");
            if (value) {
                obj[name] = value.toString();
            }
        }
        return obj;
    }
    return false;
}
//把Img的属性还原为html
function imgJson2html(data) {
    var str = '<img ';
    for (let attr in data) {
        str += attr.replace(/\$/g, "-") + '=' + data[attr] + ' ';
    }
    str+= '/>';
    return str;
}


//检测文件或者文件夹存在 nodeJS
function fsExistsSync(path) {
    try{
        fs.accessSync(path,fs.F_OK);
    }catch(e){
        return false;
    }
    return true;
}