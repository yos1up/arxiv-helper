// ==UserScript==
// @name         arXiv helper
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  arXiv helper
// @author       yos1up, txmy
// @match        https://arxiv.org/list/*
// @grant        none
// ==/UserScript==

/* Google 検索ボタンの追加 */
(function() {
  let idList = document.getElementsByClassName("list-identifier");
  let titleList = document.getElementsByClassName("list-title");
  for(let i=0;i<titleList.length;i++){
    var paperID = idList[i].innerText.substr(6, 10); // 論文 ID
    var title = titleList[i].innerText;
    var uri = encodeURI('https://www.google.com/search?q="' + title + '" or "' + paperID + '"&lr=lang_ja');
    titleList[i].innerHTML += '<a href="' + uri + '" target="_blank">🔍</a>';
  }
})();

/* 著者情報の追加 */
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
  let uri = "https://script.google.com/macros/s/AKfycbzjymJLshTAX8RopL9CTbdiNm1NsthlonLOOIFRLsj_aDcvVFk/exec?names=" + authors;
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
          let targetAffs = {
            "Google":"",
            "Apple":"",
            "Microsoft":"",
            "Facebook":"",
            "Amazon":"",
            "DeepMind":"",
            "IBM":"",
            "Karakuri":"",
            "Mila":"",
            "Preferred":"",
            "UTokyo":"",
            "University of Tokyo":"UTokyo",
            "Stanford":"",
          };
          for(let target in targetAffs){
            if (aff.indexOf(target) >= 0){
              let dispName = targetAffs[target];
              if (dispName.length === 0) dispName = target;
              a.innerHTML += '<sup><span style="background-color: red; color: white">' + dispName + '</span></sup>';
            }
          }
        }
      }
    }
  }
  xhr.open('GET', uri);
  xhr.send(null);
})();