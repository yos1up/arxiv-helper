/*
人名を問い合わせると， Google scholar citation profile のページに記載された著者情報（h-index と 所属）が返ってきます．
複数名を同時に問い合わせることが可能です．

一度問い合わせた結果は，スプレッドシート上にキャッシュされ，2回目からは高速に取得されます．
--------
Request (GET):
  [Endpoint URI]?names=Surya Ganguli,Yann LeCun

Returns (text/json):
  {
    "code": 0,
    "message": "",
    "result": [
      {"hIndex": 32, "affiliation": "hoge Research Institute"},
      {"hIndex": 64, "affiliation": "piyo University"}
    ]
  }

Caution:
  - hIndex 値は， 取得失敗した場合は「負の値」となります．
  - affiliation は，取得失敗した場合は空文字列となります．
*/

/*
TODO: discriminate identical name (impossible??)
*/
function doGet(e) {
  var names = e.parameter.names;
  // var names = "Surya Ganguli,Yann LeCun, Diederik  Kingma, Michel Valstar";
  Logger.log("[doGet] names = " + names);
  
  var result = {
    'code': 0,
    'message': '',
    'result': []
  };
  
  if (typeof names === "undefined") {
    result["code"] = -1;
    result["message"] = 'Specify parameter `names` as string, which contains comma-separated target authors. e.g. "Surya Ganguli,Yann LeCun"';
  } else { 
    // 前処理
    names = names.split(","); // 配列に変換
    for(var i=0;i<names.length;i++) names[i] = names[i].trim(); // 前後スペースの削除
    
    // シートデータ取得
    var file = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = file.getSheetByName("h-index");
    /* sheet の構成            
            | name | nameFound | userID | hIndex | updatedAt | affiliation |
    */
    var sheetData = sheet.getDataRange().getValues();
    var extraRows = [];
    
    // シートにヘッダすらない場合は，ヘッダをつける．
    var headerRow = ["name", "nameFound", "userID", "hIndex", "updatedAt", "affiliation"];
    if (sheetData.length === 0){ // まっさらの場合
      sheet.appendRow(headerRow);
    } else if (sheetData[0].join("").length === 0){ // 空の一行が認識されることがあるので．
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    }


    // sheetData から 行番号を引くための dict を構築
    var toRowNum = {};
    for(var i=1;i<sheetData.length;i++){ // ヘッダ行はのぞいてある
      toRowNum[sheetData[i][0]] = i;
    }

    var date = new Date();
    for(var i=0;i<names.length;i++){
      var name = names[i];
      var row = toRowNum[name];
      
      var hIndex, aff;
      if (typeof row === "undefined"){ // その name の記録がシートにない場合， web で調査する．
        var ret = getAuthorInfo(name);
        hIndex = ret["hIndex"];
        aff = ret["affiliation"];
        // AuthorInfo の調査に成功した場合も失敗した場合も，シートに追記する（実際の追記は下でまとめて行う）
        extraRows.push([name, ret["nameFound"], ret["userID"], hIndex, date, aff]);
      }else{ // その name の記録がシートにある場合， その記録を返す．
        hIndex = sheetData[row][3];
        aff = sheetData[row][5];
        Logger.log("[doGet] name = " + name + " : record found. hIndex = " + hIndex + ", affiliation = " + aff);
      }
      result["result"].push({
        "hIndex": hIndex,
        "affiliation": aff
      });
    }
    if (extraRows.length > 0){ // シートへの追記
      sheet.getRange(1+sheetData.length, 1, extraRows.length, extraRows[0].length).setValues(extraRows);
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}


function substringBetweenKeys(str, begin, end, inclusive){
  /*
    与えられた文字列 str から， 文字列 begin と文字列 end に挟まれた連続部分文字列を検索し，最初にヒットしたものを返します．
    ただし， begin にヒットする場所がない場合は，空文字列が返ります．
    begin にヒットする場所があったが，そこから先に end にヒットする場所がない場合は， begin から文字列の終端までが返ります．
    ----
    Args:
      str, begin, end (string): 上述の通り
      inclusive (bool)(default: true): 返す文字列に begin と end を含めるか否か．
   
    Examples:
      ("abcdefghi", "bc", "gh", false) => "def"
      ("abcdefghi", "bc", "gh", true) => "bcdefgh"
      ("abcdefghi", "bc", "xx", true) => "bcdefghi"
      ("abcdefghi", "xx", "gh", true) => ""
  */
  if (typeof inclusive === "undefined") inclusive = true;
  var offs = str.indexOf(begin);
  if (offs < 0) return "";
  var offs2 = str.indexOf(end, offs + begin.length);
  if (!inclusive) offs += begin.length;
  if (offs2 < 0) return str.substring(offs);
  if (inclusive) offs2 += end.length;
  return str.substring(offs, offs2);
}

function removeTags(str){
  /*
    与えられた文字列の， < から > で囲まれた範囲を全て取り除いた文字列を返す．
    HTMLタグ除去目的．
    
    Examples:
      "hoge<piyo>fuga<foo>bar" => "hogefugabar"
      "abc<def<ghi>jkl>mno" => "abcmno"
  */
  var ret = "";
  var level = 0;
  for(var i=0;i<str.length;i++){
    if (str[i] === "<") level++;
    else if (str[i] === ">") level--;
    else if (level === 0) ret += str[i];
  }
  return ret;
}

function searchAuthor(name){
  /*
    著者の名前を scholar citation の検索機能で検索し，第一位の結果を取得して返します．
    --------
    Args:
      name (string): 調べたい著者の名前（一人）．
      
    Returns:
      (Object) {
        "nameFound": (string) : 検索結果の第一位の人名．概ね name と一致するが，一致しないこともある． 検索が 0 hit の場合は空文字列が返る．
        "userID": (string) : 検索結果の第一位の citation profile ページの ID． 検索が 0 hit の場合は空文字列が返る．
      }
  */
  Logger.log("[searchAuthor] name = " + name);
  var url = encodeURI("https://scholar.google.co.jp/citations?view_op=search_authors&mauthors=" + name);
  var response = UrlFetchApp.fetch(url);
  var peopleListHtml = response.getContentText("UTF-8");
  var firstPeopleInfo = substringBetweenKeys(peopleListHtml, '<div class="gs_ai gs_scl gs_ai_chpr">', '<div class="gs_ai gs_scl gs_ai_chpr">');
  var userIDIndex = firstPeopleInfo.indexOf("user=");
  if (userIDIndex >= 0){
    var nameFound = substringBetweenKeys(firstPeopleInfo, 'img alt="', '"', false);  
    Logger.log("[searchAuthor] nameFound = " + nameFound);
    var userID = firstPeopleInfo.substr(userIDIndex + ("user=".length), 12);
    Logger.log("[searchAuthor] userID = " + userID);    
    return {
      "nameFound": nameFound,
      "userID": userID
    };
  }else{
    Logger.log("[searchAuthor] name not found.");
  }
  return {
    "nameFound": "",
    "userID": ""
  };
}


function getAuthorInfoFromID(userID){
  /*
    与えられた userID の scholar citation profile ページから，著者情報を取得します．
    --------
    Args:
      userID (string): profile ページの ID.
      
    Returns:
      (Object) {
        "hIndex": (integer) : h-index の値． 0以上の整数値． 取得に失敗した場合は -1 となる．
        "affiliation": (string) : 所属を表す文字列．取得に失敗した場合は空文字列．
      }
  */
  Logger.log("[getAuthorInfoFromID] userID = " + userID);
  var url = encodeURI("https://scholar.google.co.jp/citations?hl=ja&user=" + userID);
  var response = UrlFetchApp.fetch(url);
  var profileHtml = response.getContentText("UTF-8");
  var hIndex = substringBetweenKeys(profileHtml, 'h 指標</a></td><td class="gsc_rsb_std">', '<', false);
  if (hIndex !== ""){
    hIndex = Number(hIndex);
    Logger.log("[getAuthorInfoFromID] hIndex = " + hIndex);
  }else{
    hIndex = -1;
  }
  // var doc = XmlService.parse(profileHtml); // Error: The markup in the document preceding the root element must be well-formed
  var aff = substringBetweenKeys(profileHtml, '<div class="gsc_prf_il">', "</div>", false);
  aff = removeTags(aff);
  Logger.log("[getAuthorInfoFromID] aff = " + aff);
  return {
    "hIndex": hIndex,
    "affiliation": aff,
  };
}


function getAuthorInfo(name){
  /*
    著者名から，以下の手順で著者情報を取得します．
    1. scholar citation の著者検索機能で，著者名を検索する．
    2. 最上位の結果の citation profile ページから，著者情報を取得する．
    --------
    Args:
      name (string): 著者名（一人）
      
    Returns:
      (Object) {
        "nameFound": (string):
          scholar citation の著者検索結果の最上位の人物名．
          著者検索に失敗した場合は空文字列．
        "userID": (string):
          scholar citation の著者検索結果の最上位の profile ページの ID．
          著者検索に失敗した場合は空文字列．
        "hIndex": (integer):
          上記の profile ページから取得した h-index 値．
          著者検索に失敗した場合は -2 となり，著者検索には成功したが h-index 情報が取れなかった場合は -1 となる．
        "affiliation": (string):
          上記の profile ページから取得した著者所属情報．
          取得失敗した場合は空文字列．
      } 
 */
  var ret = searchAuthor(name);
  var nameFound = ret["nameFound"];
  var userID = ret["userID"];
  var hIndex = -256;
  var aff = "";
  if (userID === ""){
    hIndex = -2;
  }else{
    ret = getAuthorInfoFromID(userID);
    hIndex = ret["hIndex"];
    aff = ret["affiliation"];
  }
  return {
    "nameFound": nameFound,
    "userID": userID,
    "hIndex": hIndex,
    "affiliation": aff
  };  
}
