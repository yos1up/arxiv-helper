// ==UserScript==
// @name         arXiv helper
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  arXiv helper
// @author       yos1up, txmy
// @match        https://arxiv.org/list/stat.ML/*
// @grant        none
// ==/UserScript==

(function() {
  let authorAnchors = [];
  let authors = new Set();
  let listAuthorsList = document.getElementsByClassName("list-authors");
  for (let listAuthors of listAuthorsList){
    let anchors = listAuthors.getElementsByTagName("a");
    for (let a of anchors){
      authorAnchors.push(a);
      authors.add(a.innerText);
    }
  }
  authors = Array.from(authors.values()).join(",");
  console.log("authors == ", authors);

  if (authors.length == 0) return;

  // h-index　を取得
  let uri = "https://script.google.com/macros/s/AKfycbw301yDI-0JvTFBEeHjARR-eWO0r7IyJujdOkE0y6WmQEbb6-ZS/exec?names=" + authors;
  let xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function(){
    var READYSTATE_COMPLETED = 4;
    var HTTP_STATUS_OK = 200;
    if( this.readyState == READYSTATE_COMPLETED && this.status == HTTP_STATUS_OK ){
      // レスポンスから辞書を作成．
      authors = authors.split(",");
      let hIndices = JSON.parse(this.responseText).result;
      let authorInfoDict = {};
      for(let i=0;i<authors.length;i++){
        authorInfoDict[authors[i]] = hIndices[i];
      }
      console.log("authorInfoDict == ", authorInfoDict);
      // authorAnchors の innerText を書き換えていく．
      for(let a of authorAnchors){
        a.style.color = 'black';
        let info = authorInfoDict[a.innerText];
        if (typeof info !== "undefined"){
          let index = info.hIndex;
          if (typeof index !== "undefined" && index >= 0){
            a.innerHTML += "<sup>" + index + "</sup>";
            let colors = ['gray', 'green', '#03A89E', 'blue', '#a0a','#FF8C00', 'red'];
            a.style.color = colors[Math.min(Math.floor(index/10), 6)];
          }
          let aff = info.affiliation;
          let targetAffs = ["Google", "Apple", "Microsoft", "Facebook", "Amazon", "DeepMind", "Mila", "Preferred"];
          for(let target of targetAffs){
            if (aff.indexOf(target)>=0){
              a.innerHTML += '<sup><span style="background-color: red; color: white">' + target + '</span></sup>';
            }
          }
        }
      }
    }
  }
  xhr.open('GET', uri);
  xhr.send(null);
})();