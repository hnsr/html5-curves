var console;

var selection;
var selection_pos;
var selection_dragging;
var selection_dragcurve;


function log(msg)
{
    if (!console.length) return;

    console.append(msg+"\n");
    console.scrollTop(console[0].scrollHeight);
}


// Get mouse position relative to element on which event triggered. Use only for elements with no
// padding.
function getMousePosInElement(event)
{
    // .offset() gives the offset between element's outer edge and document origin, clientLeft/Top
    // give relative offset of the element's client area (which seems to include padding) and its
    // outer edge, I use this to account for the border. Not sure how to properly account for
    // padding..
    var offset = $(event.target).offset();

    return {
        x: event.pageX - offset.left - event.target.clientLeft,
        y: event.pageY - offset.top  - event.target.clientTop
    };
}


function handleMouse(type, event, cm)
{
    var pos = getMousePosInElement(event);

    if (type == "down")
    {
        selection = cm.select(pos.x, pos.y);
        cm.redraw(); // Always redraw incase selection changed/cleared

        if (selection)
        {
            selection_pos = pos;
            selection_dragging = true;
            selection_dragcurve = event.shiftKey;
        }

        updateSelectionControls();
        updateSelectionNodeInfo();
    }
    else if (type == "move")
    {
        if (selection && selection_dragging)
        {
            if (selection_dragcurve)
                cm.translateSelectionCurve(pos.x-selection_pos.x, pos.y-selection_pos.y);
            else
                cm.translateSelection(pos.x-selection_pos.x, pos.y-selection_pos.y);

            cm.redraw();
            selection_pos = pos;
            updateSelectionNodeInfo();
        }
    }
    else if (type == "up")
    {
        if (selection_dragging) selection_dragging = false;
    }
}


function updateSelectionNodeInfo()
{
    if (!selection)
    {
        $("#selectionNodeInfo").empty();
        return;
    }

    var str = "", n = selection.node;

    str += "<strong>node</strong> #"+selection.curve.getNodeIndex(n)+" ";
    str += "<strong>pos:</strong> "+n.x.toFixed(2)+", "+n.y.toFixed(2)+" ";
    str += "<strong>in:</strong> "+n.in.x.toFixed(2)+", "+n.in.y.toFixed(2)+" ";
    str += "<strong>out:</strong> "+n.out.x.toFixed(2)+", "+n.out.y.toFixed(2)+"";

    $("#selectionNodeInfo").html(str);
}


// Show and initialize selection options for current selection
function updateSelectionControls()
{
    if (!selection)
    {
        $("#selectionControls").hide();
        return;
    }

    var selected, selected_yes = " selected=\"selected\" ";

    var $curveType = $("#curveType select");
    var $nodeType = $("#nodeType select");
    var $curveEndPointType = $("#curveEndPointType select");

    // Curve/node type options are inserted on the fly, so remove the old options first.
    $curveType.empty();
    $nodeType.empty();
    $curveEndPointType.empty();

    for (var i in Curve.TYPE)
    {
        selected = selection.curve.type == Curve.TYPE[i] ? selected_yes : "";
        $curveType.append("<option "+selected+" value=\""+Curve.TYPE[i]+"\">"+i+"</option>");
    }

    // Only display node type control on curve types that work with tangents
    if (selection.curve.type == Curve.TYPE.hermite)
    {
        $("#nodeType").show();

        for (var i in Curve.NODE_TYPE)
        {
            selected = selection.node.type == Curve.NODE_TYPE[i] ? selected_yes : "";
            $nodeType.append("<option "+selected+" value=\""+Curve.NODE_TYPE[i]+"\">"+i+"</option>");
        }
    }
    else
        $("#nodeType").hide();

    // Display end point tangent generation method if the curve supports it
    if (selection.curve.hasEndPointTangentOptions())
    {
        $("#curveEndPointType").show();

        for (var i in Curve.ENDPOINT_TYPE)
        {
            selected = selection.curve.endpoint_type == Curve.ENDPOINT_TYPE[i] ? selected_yes : "";
            $curveEndPointType.append("<option "+selected+" value=\""+Curve.ENDPOINT_TYPE[i]+"\">"+i+"</option>");
        }
    }
    else
        $("#curveEndPointType").hide();

    $("#selectionControls").show();
}


// Init UI state, makes sure input fields match CM values etc.
function initUI(curvemanager)
{
    $("#drawSteps").attr("value", curvemanager.steps);

    curvemanager.clearSelection();
    selection = null;
    updateSelectionControls();
}


function toggleDrawStyle(cm)
{
    if (cm.drawStyle == CurveManager.STYLE.dots)
        cm.drawStyle = CurveManager.STYLE.path;
    else
        cm.drawStyle = CurveManager.STYLE.dots;

    cm.redraw();
}


function loadData(curvemanager)
{
    $.getJSON("curvejson.php", null, function(data)
    {
        // Not adding my own data for now, so pass on the data directly to curvemanager.
        curvemanager.curves = new Array();
        curvemanager.load(data);
        curvemanager.redraw();

        initUI(curvemanager);

        log("Data loaded");
    });
}


function saveData(curvemanager)
{
    // Not adding my own data for now, so passing curvemanager data directly to server.
    $.post("curvejson.php", curvemanager.serialize(),
        function(data, status)
        {
            if (data != "saved")
                log("Error while saving data, response was: "+data);
            else
                log("Data saved");
        }
    );
}


function dumpData(curvemanager)
{
    log("Dumping JSON data:");
    log(curvemanager.serialize());
}


$(function ()
{
    var canvas = $("#viewport canvas");
    console = $("#console");

    if (canvas.length < 1) return;

    var cm = new CurveManager(canvas[0], log);

    loadData(cm);

    // Start listening to mouse events on the canvas and controls
    canvas.bind("mousedown",   function(e) { if (e.button == 0) handleMouse("down", e, cm); });
    canvas.bind("mousemove",   function(e) { if (e.button == 0) handleMouse("move", e, cm); });
    canvas.bind("mouseup",     function(e) { if (e.button == 0) handleMouse("up",   e, cm); });
    canvas.bind('selectstart', function(e) { return false; }); // Don't start selection on canvas

    $("#loadData").click(function (e) {loadData(cm)});
    $("#saveData").click(function (e) {saveData(cm)});
    $("#toggleControls").click(function (e) {cm.showControls = !cm.showControls; cm.redraw()});
    $("#toggleDrawStyle").click(function (e) {toggleDrawStyle(cm)});
    $("#toggleConsole").click(function () {console.toggle()});
    $("#dumpData").click(function () { dumpData(cm) });

    $("#drawSteps").attr("value", cm.steps);
    $("#drawSteps").change(function ()
    {
        cm.steps = $(this).attr("value");
        cm.redraw();
    });

    $("#addCurve").click(function ()
    {
        var nodes = [ { type: 0, x: 260, y: 220, in: { x: 0, y: 150 }, out: { x: 0, y: 150 } },
                      { type: 0, x: 320, y: 220, in: { x: 0, y: 150 }, out: { x: 0, y: 150 } }  ];
        cm.curves.push(new Curve(Curve.TYPE.hermite, nodes, log));
        cm.redraw();
    });

    $("#curveType select").change(function (e)
    {
        if (selection)
        {
            selection.curve.setType(e.target.value);
            cm.redraw();
            updateSelectionControls(); // Reinit selection UI for changed curve type.
        }
    });

    $("#curveEndPointType select").change(function (e)
    {
        if (selection)
        {
            selection.curve.setEndPointType(e.target.value);
            cm.redraw();
            updateSelectionControls(); // Reinit selection UI for changed curve type.
        }
    });


    $("#nodeType select").change(function (e)
    {
        if (selection)
        {
            selection.curve.setNodeType(selection.node, e.target.value);
            cm.redraw();
        }
    });

    $("#deleteNode").click(function ()
    {
        if (selection && selection.curve.deleteNode(selection.node))
        {
            cm.clearSelection();
            cm.redraw();
            selection = null;
            updateSelectionControls();
            updateSelectionNodeInfo();
        }
    });

    $("#deleteCurve").click(function ()
    {
        if (selection)
        {
            cm.deleteCurve(selection.curve);
            cm.redraw();
            selection = null;
            updateSelectionControls();
            updateSelectionNodeInfo();
        }
    });


    function addNode(before)
    {
        if (!selection) return;

        // TODO: Consider inserting nodes at midpoint between neighbouring nodes if applicable (but
        // also consider edge cases..
        // TODO: And also, I could use derivative for new nodes' tangents?
        // TODO: In fact, should base new nodes position base on selected node's position+tangent?
        // at least for curves with explicit tangents. (and maybe even those without?)

        selection.curve.insertNode(selection.node, before,
        {
            type: 0,
            x: selection.node.x + (before ? -40 : 40), /* offset new node */
            y: selection.node.y,
            in:  { x: 40, y: 0 },
            out: { x: 40, y: 0 }
        });
        cm.redraw();
        updateSelectionControls(); // Reinit selection UI, selected node index might have changed.
    }

    $("#addNodeBefore").click(function () { addNode(true); });
    $("#addNodeAfter").click(function () { addNode(false); });

    console.dblclick(function(e)
    {
        e.preventDefault();
        console.hide();
    });
});

