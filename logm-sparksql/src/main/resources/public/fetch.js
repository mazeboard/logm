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
var domainname = 'domain0';
var projectname = 'project0';
var projects = {};
var localprojects = {};
var sources = {};
var selectedElement = null;
var dashboardGid=0;
var queryGid=0;
var projectGid=0;
var domainGid=0;
var dashboard = new dashboardEditor();
var labels = {queries:{}, dashboards:{}, projects:{}};
var ch = new channel('/fetch-sql');

localprojects[projectname] = {domain:domainname, name:projectname, sources:sources, queries:{}, dashboards:{}};
$('#projectname').val(projectname);

displayDummy();

editor.setTheme("ace/theme/eclipse");
editor.session.setMode("ace/mode/sql");
editor.setOptions({enableBasicAutocompletion: true});
langTools.setCompleters([completer]);

$('#save-project').bind('click', function(e) {
	var name = $('#projectname').val();
	if (name!="") {
        if (Object.keys(localprojects).includes(name)) {
            projects[name] = localprojects[name];
            delete localprojects[name];
        }
        projects[name] = {domain:domainname, name:name, sources:sources, queries:queries, dashboards:dashboards};
        savedProject(name);
        ch.send("project", projects[name]);
	}
});

$('#delete-project').bind('click', function(e) {
	var name = $('#projectname').val();
	if (name!="" && Object.keys(projects).includes(name)) {
        // TODO confirm deletion
        if (Object.keys(localprojects).includes(name)) {
            delete localprojects[name];
        } else {
            ch.send("delete", name);
            delete projects[name];
        }
        newProject();
	}
});

$('#add-query').bind('click', function(e) {
	var keys = Object.keys(queries);
	var newname = "query"+(queryGid++);
	while (keys.includes(newname)) {
		newname = "query"+(queryGid++);
    }
	addQuery(newname, "");
});

$('#delete-query').bind('click', function(e) {
	if (Array.from($('#queries').children()).includes(selectedElement)) {
		console.log('delete queries['+$('.selectable-name', selectedElement).html()+']');
		delete queries[$('.selectable-name', selectedElement).html()];
		console.log(queries[$('.selectable-name', selectedElement).html()]);
		console.log(queries);
		selectElement(selectQuery);
	}
});

$('#add-dashboard').bind('click', function(e) {
	var keys = Object.keys(dashboards);
    var newname = "db"+(dashboardGid++);
	while (keys.includes(newname)) {
		newname = "db"+(dashboardGid++);
	}
	addDashboard(newname, "");
});

$('#delete-dashboard').bind('click', function(e) {
	if (Array.from($('#dashboards').children()).includes(selectedElement)) {
		console.log('delete dashboards['+$('.selectable-name', selectedElement).html()+']');
		delete dashboards[$('.selectable-name', selectedElement).html()];
		selectElement(selectDashboard);
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
    $('#fetch-sql').removeClass('disconnected');
    $('#fetch-sql').addClass('connected');
});

ch.receive('close', () => {
	paused = true;
	connected = false;
    $('#fetch-sql').removeClass('connected');
    $('#fetch-sql').addClass('disconnected');
});

ch.receive('error', (data) => {
	paused = true;
	$('#fetch-sql').addClass('paused');
    $('#fetch-sql').removeClass('running');	
    console.log(data);
	//alert(data);
});

ch.receive('result', (data) => {
	$('#result').html(refreshQueryResult(data));
	paused = true;
	$('#fetch-sql').addClass('paused');
	$('#fetch-sql').removeClass('running');
});

ch.receive('source',(data) => {
	addSourceForCompletion(data);
	sources[data.name]=data;
});

ch.receive('project',(data) => {
    var domain = data.domain;
    var name = data.name;
	// TODO merge and solve conflicts
	if (Objects.keys(projects).includes(domain) && Objects.keys(projects[domain]).includes(name)) {
		var project = projects[domain][name];
		var diffQueries = compareObjs(data.queries, project.queries);
		var diffDashboards = compareObjs(data.dashboards, project.dashboards);
		if (Object.keys(diffQueries).length>0 || Object.keys(diffDashboards).length>0) {
			// TODO allow user to solve conflicts
			console.log(diffQueries);
			console.log(diffDashboards);
			alert('received project '+data.name+' is different than the local project')
			return; // reject project
		}
    }
    if (projects[domain]==undefined) projects[domain]={};
    projects[domain][name]=data;
    refreshProjectMenu(domain, name);
    refreshDomainMenu(domain);
});
    
///// helper functions

function refreshProjectMenu(domain, name, local=false) {
    if (domain == $('#domainname').html()) {
        if (local) {
            if (!$('#localprojects').children().map(x => $(x).html()).includes(name)) {
                $('#localprojects').prepend('<a href="#" class="w3-bar-item menu-item" onclick="loadProject(this)">'+name+'</a>');
            }
        } else {
            if (!$('#savedprojects').children().map(x => $(x).html()).includes(name)) {
                $('#savedprojects').prepend('<a href="#" class="w3-bar-item menu-item" onclick="loadProject(this)">'+name+'</a>');
            }
        }
    }  
}

function refreshDomainMenu(domain) {
   if (!$('#domainname').children().map(x => $(x).html()).includes(domain)) {
       $('#domainname').prepend(domain);
   }
}

function setDomainName(e) {

}

function setProjectName(e) {
  
}

function newProject() {
    projectname = 'project'+(projectGid++);
    $('#projectname').val(projectname);
    $('#queries').html("");
    $('#dashboards').html("");
    queries = {};
    dashboards = {};
    if (selectedElement!=null) {
        $('.selectable-name-input', selectedElement).css('display','none');
        $('.selectable-name', selectedElement).css('display','block');
        selectedElement = null;
    }
    localprojects[projectname] = {name:projectname, sources:sources, queries:queries, dashboards:dashboards};
}

function addQuery(name, value) {
    queries[name]=value;
    $('#queries').prepend('<div class="selectable-name-container w3-row" ondblclick="modifyName(this)" onclick="selectQuery(this)"><input class=selectable-name-input onkeypress="endModifyName(this)"></input><a class=selectable-name href="#">'+name+'</a></div>');
    var elem = $('#queries').children()[0];
    labels.queries[name] = elem;
    $(elem).addClass('not-saved');
    editor.setValue(queries[name]);
}

function addDashboard(name, value) {
    dashboards[name] = value;
    $('#dashboards').prepend('<div class="selectable-name-container w3-row" ondblclick="modifyName(this)" onclick="selectDashboard(this)"><input class=selectable-name-input onkeypress="endModifyName(this)"></input><a class=selectable-name href="#">'+name+'</a></div>');
    var elem = $('#dashboards').children()[0];
    labels.dashboards[name] = elem;
    $(elem).addClass('not-saved');
    dashboard.setValue(dashboards[name]);
}

function renameQuery(e) {
    console.log(e);
}

function savedProject(name) {
    var project = projects[name];
    $(labels.projects[name]).removeClass("not-saved");
    Object.keys(project.queries).forEach(name => {
        $(labels.queries[name]).removeClass("not-saved");
    });
    Object.keys(project.dashboards).forEach(name => {
        $(labels.dashboards[name]).removeClass("not-saved");
    });
}

function compareObjs(obj1, obj2) {
    var result = {}
    Object.keys(obj1).concat(Object.keys(obj2)).filter(distinct).forEach(key => {
        if (obj1[key] != obj2[key]) {
        result[key]={obj1:obj1[key], obj2:obj2[key]}
            }
    });
    return result;
}

function loadProject(name) {
	if (Object.keys(projects).includes(name)) {
		newqueries = projects[name].queries;
		newdashboards = projects[name].dashboards;
		newProject();
		$('#projectname').val(name);
		queries = newqueries;
		dashboards = newdashboards;
		Object.keys(queries).map((name) => { addQuery(name, queries[name])});
		Object.keys(dashboards).map((name) => { addDashboard(name, dashboards[name])});
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

function selectElement(select) {
	var elem = selectedElement;
	var i = $(elem).index();
	var children = $(elem).parent().children();
	if (children[i-1]==undefined) {
		if (children[i+1]!=undefined) {
			select(children[i+1], true);
		} else {
			displayDummy(true);
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

function displayDummy(remove=false) {
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

function refreshQueryResult(list) {
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

const distinct = (value, index, self) => {
    return self.indexOf(value) === index;
}
  