var editor = ace.edit("editor");
var langTools = ace.require("ace/ext/language_tools");
var completer = {
    getCompletions: function(editor, session, pos, prefix, callback) {
        if (prefix.length === 0) { callback(null, sourcenames); return }
        var r = new RegExp(prefix);
        var alts = tables.filter(table => 
             //table.value.startsWith(prefix)
             r.exec(table.value) != null
        );
        callback(null, alts);
    }
}
var sourcenames = [];
var tables = [];
var paused = true;
var connected = false;
var projectname = null;
var projects = {};
var sources = {};
var queries = {};
var dashboards = {};
var selectedElement = null;
var dbgid=0;
var qgid=0;
var dashboard = new dashboardEditor();

selectDummy();

var ch = new channel('/fetch-sql');

editor.setTheme("ace/theme/eclipse");
editor.session.setMode("ace/mode/sql");
editor.setOptions({enableBasicAutocompletion: true});
langTools.setCompleters([completer]);

$('#save-project').bind('click', function(e) {
	var projectname = $('#projectname').val();
	if (projectname!="") {
		if (Object.keys(projects).includes(projectname)) {
			//  TODO confirm
		}
		projects[projectname] = {name:projectname, sources:sources, queries:queries, dashboards:dashboards};
		ch.send("project", projects[projectname]);
	}
});

$('#delete-project').bind('click', function(e) {
	var projectname = $('#projectname').val();
	if (projectname!="" && Object.keys(projects).includes(projectname)) {
		// TODO confirm deletion
    ch.send("delete", projectname);
		delete projects[projectname];
		newProject();
	}
});

$('#add-query').bind('click', function(e) {
	var keys = Object.keys(queries);
	var newname = "query"+(qgid++);
	while (keys.includes(newname)) {
		newname = "query"+(qgid++);
	}
	queries[newname]="";
	newQuery(newname);
});

function newQuery(name) {
	$('#queries').prepend('<div class="selectable-name-container w3-row" ondblclick="modifyName(this)" onclick="selectQuery(this)"><input class=selectable-name-input onkeypress="endModifyName(this)"></input><a class=selectable-name href="#">'+name+'</a></div>');
	editor.setValue(queries[name]);
}

function newDashboard(name) {
	$('#dashboards').prepend('<div class="selectable-name-container w3-row" ondblclick="modifyName(this)" onclick="selectDashboard(this)"><input class=selectable-name-input onkeypress="endModifyName(this)"></input><a class=selectable-name href="#">'+name+'</a></div>');
	dashboard.setValue(dashboards[name]);
}

function renameQuery(e) {
  console.log(e);
}

$('#delete-query').bind('click', function(e) {
	if (Array.from($('#queries').children()).includes(selectedElement)) {
		console.log('delete queries['+$('.selectable-name', selectedElement).html()+']');
		delete queries[$('.selectable-name', selectedElement).html()];
		console.log(queries[$('.selectable-name', selectedElement).html()]);
		console.log(queries);
		removeSelectedElement(selectQuery);
	}
});

$('#add-dashboard').bind('click', function(e) {
	var keys = Object.keys(dashboards);
	var newname = "db"+(dbgid++);
	while (keys.includes(newname)) {
		newname = "db"+(dbgid++);
	}
	dashboards[newname]="";
	newDashboard(newname);
});

$('#delete-dashboard').bind('click', function(e) {
	if (Array.from($('#dashboards').children()).includes(selectedElement)) {
		console.log('delete dashboards['+$('.selectable-name', selectedElement).html()+']');
		delete dashboards[$('.selectable-name', selectedElement).html()];
		removeSelectedElement(selectDashboard);
	}
});

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
	addSourceForCompletion(data);
	sources[data.name]=data;
	});

ch.receive('project',(data) => {
	projects[data.name]=data;
	});
	
function loadProject(name) {
	if (Object.keys(projects).includes(name)) {
		newqueries = projects[name].queries;
		newdashboards = projects[name].dashboards;
		newProject();
		$('#projectname').val(name);
		queries = newqueries;
		dashboards = newdashboards;
		Object.keys(queries).map((name) => { newQuery(name)});
		Object.keys(dashboards).map((name) => { newDashboard(name)});
	}
}

function newProject() {
	$('#projectname').val("");
	$('#queries').html("");
	$('#dashboards').html("");
	queries = {};
	dashboards = {};
	if (selectedElement!=null) {
		$('.selectable-name-input', selectedElement).css('display','none');
		$('.selectable-name', selectedElement).css('display','block');
		selectedElement = null;
	}
}

function addSourceForCompletion(source) {
	var name = source.name;
	if (sourcenames.find((e) => e.value==name) == undefined) {
		sourcenames.push({name: "source", value: name});
	} else {
		var prefix = name+".";
		tables = tables.filter((e) => !e.value.startsWith(prefix))
	}
	source.tables.map(function (tablename) {
		tables.push({name: "table", value: name+"."+tablename});
	});
}

function removeSelectedElement(select) {
	var elem = selectedElement;
	var i = $(elem).index();
	var children = $(elem).parent().children();
	if (children[i-1]==undefined) {
		if (children[i+1]!=undefined) {
			select(children[i+1], true);
		} else {
			selectDummy(true);
		}
	} else {
		 select(children[i-1], true);
	}
	$(elem).remove();
}

function modifyName(e) {
	var name = $('.selectable-name', e);
	var input = $('.selectable-name-input', e);
	input.val(name.html());
	name.css('display','none')
	input.css('display','block')
}

function endModifyName(input) {
	var x = event.which || event.keyCode;
	if (x==13) {
		var selectablename = $('.selectable-name', $(input).parent());
		var oldname = selectablename.html();
		var newname = $(input).val();
		if (!Object.keys(queries).includes(newname)) {
			selectablename.html(newname);
			var query = queries[oldname];
			delete queries[oldname];
			queries[newname]=query;
		}
		selectablename.css('display','block')
		$(input).css('display','none')
}
}

function selectDummy(remove=false) {
	deselectElement(remove);
	$('#dashboardeditor').css('display','none')
	$('#queryeditor').css('display','none')
	$('#dummy').css('display','block')
}

function selectQuery(e, remove=false) {
	deselectElement(remove);
	selectedElement = e;
	$(e).addClass("selected");
	$('#dashboardeditor').css('display','none');
	$('#dummy').css('display','none');
	$('#queryeditor').css('display','block');
	editor.setValue(queries[$('.selectable-name', e).html()]);
}

function selectDashboard(e, remove=false) {
	deselectElement(remove);
  selectedElement = e;
  $(e).addClass("selected");
	$('#queryeditor').css('display','none')
	$('#dummy').css('display','none');
	$('#dashboardeditor').css('display','block')
	dashboard.setValue(dashboards[$('.selectable-name', e).html()]);
}

function deselectElement(remove=false) {
	if (selectedElement!=null) {
		if (!remove) {
			if ($(selectedElement).parent().attr('id')=='queries') {
				queries[$('.selectable-name', selectedElement).html()]=editor.getValue();
			} else {
				dashboards[$('.selectable-name', selectedElement).html()]=dashboard.getValue();
			}
		}
		$('.selectable-name-input', selectedElement).css('display','none');
		$('.selectable-name', selectedElement).css('display','block');
		$(selectedElement).removeClass("selected");
		selectedElement=null;
	}
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


