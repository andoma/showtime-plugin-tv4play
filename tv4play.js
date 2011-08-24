/**
 * TV4 Play plugin using http://mobapi.tv4play.se API 
 * TODO: add Senaste, Mest tittade and A-Z
 * TODO: use pagination for the searcher

 Brief explanation of steps: 
category listing: http://mobapi.tv4play.se/video/categories/list , which gives a category id, for example 2.77843
followed by:  http://mobapi.tv4play.se/video/program_formats/list.json?sorttype=name&premium_filter=free&categoryid=2.77843 , which gives a new id, for example 1.1912577
followed by: http://mobapi.tv4play.se/video/programs/search.json?platform=web&video_types=programs&premium=false&sorttype=date&livepublished=false&categoryids=1.1912577&startdate=197001010100
this will give vmanprogid which is the program id to send to tv4play:clip:([0-9]*) function
 */

(function(plugin) {
  var service = plugin.createService("TV4 Play",
		       "tv4play:categorylist", "tv",
		       true, plugin.path + "tv4play.jpg");

  var settings = plugin.createSettings("TV4 Play", plugin.path + "tv4play.jpg", "TV4 Play");

  
  settings.createInt("bandwidth", "Max video bitrate: ", 3000, 350, 3000, 150, "kbps", function(v) { //2500, 1500, 800 and 300 have been spotted.
	  service.bandwidth = v;
	  });

  //TODO: make video icon size a setting

  var tv4ci = new Namespace("http://www.tv4.se/xml/contentinfo");
  var tv4va = new Namespace("http://www.tv4.se/xml/videoapi");

  function getVerifiableVideoUrl(url) {
      var swfUrl="http://wwwb.tv4play.se/polopoly_fs/1.939636.1281635185\!approot/tv4video.swf?"; //TODO: find out how to get the actual url, in case it changes
      return url + " swfurl=" + swfUrl + " swfvfy=true";
  }

  function getVideoURL(xmlDoc) {
      var metaNodes = xmlDoc.head.meta;
      var baseURL = "";

      for(var i=0; i<metaNodes.length(); i++) {
	  var base = metaNodes[i].@base;
	  
	  if(base != undefined) {
	      baseURL = base;
	      break;
	  }	  
      }

      if(baseURL == "")
	  throw new Error("Could not find base URL");

      var bestClip;

      for each (var v in xmlDoc.body.switch.video) {
	      if(!bestClip) { //first round.
		  bestClip = v;
		  continue;
	      }
		  
	      var vBitrate = parseInt(v.attribute('system-bitrate'));
	      var bestClipBitrate = parseInt(bestClip.attribute('system-bitrate'));
	      
	      if(vBitrate > bestClipBitrate)
		  bestClip = v;
	  }
      
      var videoUri = bestClip.@src;
      showtime.trace("Using clip with bitrate " + bestClip.attribute('system-bitrate') + " bps");
      
      var slashIndex = videoUri.indexOf("/"); //example uri: mp4:/.....
      var videoUri = videoUri.substr(slashIndex);
      
      return(baseURL + "" + videoUri);      
  }

  plugin.addURI("tv4play:programformatslist:(.*)", function(page, categoryId) {
	  
	  populateProgramFormats(page, {categoryid: categoryId});
	  page.type = "directory";
	  page.contents = "items";
	  page.loading = false;

      });

  function mergeProperties(obj1, obj2) {
      var obj3 = {};
      for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
      for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }
      return obj3;
  }

  function populateProgramFormats(page, args) {
      var url = "http://mobapi.tv4play.se/video/program_formats/list.json";
      args = mergeProperties(args, {sorttype: "name", premium_filter: "free"});
      showtime.trace("calling " + url);
      var programList = showtime.JSONDecode(showtime.httpGet(url, args));
      for each (var program in programList) {
	      if(program.premium) {
		  showtime.trace("Skipping premium program: " + program.name);
		  continue;
	      }
	      
	      var uri = "tv4play:searchbyid:" + program.id;
	      page.appendItem(uri, "directory", {title:program.name,
			  description: program.text,
			  icon: program.image}); //consider using image_highres
	  }      
      return programList.length; 
  }


  function populateSearch(page, args) {
      var url = "http://mobapi.tv4play.se/video/programs/search.json"; //returns both full programs and clips.
      showtime.trace("calling " + url);

      args = mergeProperties(args, {platform: "web", premium: "false", sorttype: "date", startdate: "197001010100", rows: 100}); //TODO: ditch the hardcoded rows arg and implement pagination
      
      var clipList = showtime.JSONDecode(showtime.httpGet(url, args));
      
      for each (var clip in clipList.results) {
	      showtime.trace(clip.name);
	      var uri = "tv4play:clip:" + clip.vmanprogid;
	      page.appendItem(uri, "video", {title:clip.name,
			  description: clip.lead,
			  icon: clip.largeimage}); //either thumbnail, largeimage or originalimage. It is also possible to specify an arbitrary size. TODO: make this a setting
	  } 
      return clipList.results.length;
  }

  plugin.addURI("tv4play:searchbyid:(.*)", function(page, categoryId) {	  
	  populateSearch(page, {categoryids: categoryId});

	  //	  page.contents = "items"; //could be fun, but the description can't be shown then
	  page.type = "directory";
	  page.loading = false;
      });



  plugin.addURI("tv4play:categorylist", function(page) {
	  //uses headers just like the iphone, otherwise tv4play.se sometimes responds with a 406
	  var headers = {'User-Agent' : "Mozilla/5.0 (iPhone; U; CPU iPhone OS 3_0 like Mac OS X; en-us) AppleWebKit/420.1 (KHTML, like Gecko) Version/3.0 Mobile/1A542a Safari/419.3",
			 'Accept' : "*/*", 
			 'Accept-Encoding': "",
			 'Accept-Language': "sv-se",
			 'Connection': "keep-alive"};
	  var listUrl = "http://mobapi.tv4play.se/video/categories/list.json";

	  var httpResponse = showtime.httpGet(listUrl, {}, headers);

	  var categoryList = showtime.JSONDecode(httpResponse.toString());
	  
	  for each (var category in categoryList) {
		  if(category.startpage) //don't display the startpage, "tv4playnew.se"
		      continue;
		  var uri = "tv4play:programformatslist:" + category.id;
		  page.appendItem(uri, "directory", {title:category.name});
	      }

	  page.type = "directory";
	  page.loading = false;

      });



  
  function clipPopulator(page, item) {
      		  var metadata = { title: item.tv4ci::title,
				   description: item.tv4ci::text,
				   icon: item.tv4ci::w219imageUrl};
		  page.appendItem("tv4play:clip:" + item.tv4ci::vmanProgramId, "video", metadata);
  }
  

  /**
   * show clip 
   */
  plugin.addURI("tv4play:clip:([0-9]*)", function(page, clipId) {
	  var smilUrl="http://anytime.tv4.se/webtv/metafileFlash.smil?p=" + clipId + "&bw=" + service.bandwidth + "&emulate=true&sl=true";
	  showtime.trace("Calling " + smilUrl);
	  var content = showtime.httpGet(smilUrl).toString();
	  var doc = new XML(content);
	  
	  var videoURL = getVerifiableVideoUrl(getVideoURL(doc));      

	  showtime.trace("playing video at " + videoURL);
	  page.loading = false;
	  page.source = videoURL;
	  page.type = "video";
	  
      });



  /**
   * TODO: use pagination
   */
  plugin.addSearcher(
		     "TV4 Play", plugin.path + "tv4play.jpg", 
		     function(page, query) {
			 showtime.trace("TV4 play searcher called with query: '" + query + "'");
			 
			 //in the iphone app, 3 search calls are made

			 //first: program names - this is esentially the same as programformatslist. consider refactoring to use the same code
			 var count = populateProgramFormats(page, {name: query});

			 //second: full programs
			 count += populateSearch(page,{video_types: "programs", text: query});			 

			 //third: clips
			 count += populateSearch(page,{video_types: "clips", text: query});


			 showtime.trace("TV4 play number of hits: " + count);
			 page.entries = count;
			 page.type = "directory";
			 page.contents = "items";
			 page.loading = false;
		     });
  
})(this);
