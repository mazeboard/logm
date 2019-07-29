var editor = ace.edit("editor");
var langTools = ace.require("ace/ext/language_tools");
var completer = {
    getCompletions: function(editor, session, pos, prefix, callback) {
        if (prefix.length === 0) { callback(null, sources); return }
        var r = new RegExp(prefix);
        var alts = tables.filter(table => 
             //table.value.startsWith(prefix)
             r.exec(table.value) != null
        );
        callback(null, alts);
    }
}
var sources = [];
var tables = [];
var paused = true;
var connected = false;

var ch = new channel('/fetch-sql');

editor.setTheme("ace/theme/eclipse");
editor.session.setMode("ace/mode/sql");
editor.setOptions({enableBasicAutocompletion: true});
langTools.setCompleters([completer]);

$('#fetch-sql').bind('click', function(e) {
	if (connected && paused) {
		var query = editor.getValue();
	    if (query !== "") {
			paused = false;
			$('#fetch-sql').addClass('running');
			$('#fetch-sql').removeClass('paused');
	        ch.send('query', query);
	    }
	}
});

ch.receive('open', () => {
	connected = true;
	paused = true;
	if (name!=null) {
		$('#fetch-sql').removeClass('disconnected');
		$('#fetch-sql').addClass('connected');
	}
});
ch.receive('close', () => {
	paused = true;
	connected = false;
	if (name!=null) {
		$('#fetch-sql').removeClass('connected');
		$('#fetch-sql').addClass('disconnected');
	}
});
ch.receive('error', (data) => {
	paused = true;
	$('#fetch-sql').addClass('paused');
	$('#fetch-sql').removeClass('running');	
	alert(data);
});
ch.receive('result', (data) => {
	$('#result').html(refreshData(data));
	paused = true;
	$('#fetch-sql').addClass('paused');
	$('#fetch-sql').removeClass('running');
});
ch.receive('source',(data) => {
	addSourceForCompletion(data)
	});

function addSourceForCompletion(source) {
	var sourcename = source.sourcename;
	if (sources.find((e) => e.value==sourcename) == undefined) {
		sources.push({name: "source", value: sourcename});
	} else {
		var prefix = sourcename+".";
		tables = tables.filter((e) => !e.value.startsWith(prefix))
	}
	source.tables.map(function (tablename) {
		tables.push({name: "table", value: sourcename+"."+tablename});
	});
}

function capitalizeFirstLetter(string) {
	  return string.charAt(0).toUpperCase() + string.slice(1);
}

function refreshData(list) {
  if (list.length > 0) {
	  var cols = Object.keys(list[0]);
	  var headerRow = '';
	  var bodyRows = '';
	  cols.map(function(col) {
		  headerRow += '<th>' + capitalizeFirstLetter(col) + '</th>';
	  });
	  list.map(function(row,i) {
		  bodyRows += '<tr><td>'+(i+1)+'</td>';
		  cols.map(function(colName) {
			  bodyRows += '<td>' + row[colName] + '</td>';
		  });
		  bodyRows += '</tr>';
	  });
	  return "<table class=resultTable><thead><tr><th>Row</th>" + headerRow + "</tr><thead><tbody>" + bodyRows + "</tbody></table>";
  } else {
	  return "<table></table>";
  }
}  


