
function CurveManager(canvas, logFunc)
{
    if (logFunc)
        this.log = function (msg) { logFunc("CurveManager: "+msg) };
    else
        this.log = alert;

    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.curves = new Array();
}

CurveManager.STYLE =
{
    dots: 0,
    path: 1
};

CurveManager.prototype.canvas              = null;
CurveManager.prototype.context             = null;
CurveManager.prototype.selection           = null;

CurveManager.prototype.curves              = null;
CurveManager.prototype.showControls        = true;
CurveManager.prototype.debugTangents       = false;
CurveManager.prototype.drawStyle           = CurveManager.STYLE.path;
CurveManager.prototype.steps               = 160;
CurveManager.prototype.pointSize           = 2;
CurveManager.prototype.pointColor          = "rgba(0,0,0, 1)";
CurveManager.prototype.pathSize            = 4;
CurveManager.prototype.pathColor           = "rgba(0,0,0, 1)";
CurveManager.prototype.controlPointSize    = 7;
CurveManager.prototype.controlPointColor   = "rgba(255,0,0, 0.5)";
CurveManager.prototype.controlPointColorSelected = "rgba(255,0,0, 1.0)";
CurveManager.prototype.tangentScale        = 0.5;
CurveManager.prototype.tangentPathSize     = 2;
CurveManager.prototype.tangentPathColor    = "rgba(0,0,255, 0.5)";
CurveManager.prototype.tangentPointSize    = 5;
CurveManager.prototype.tangentPointColor   = "rgba(0,0,255, 0.5)";


// Load curves from decoded JSON data
CurveManager.prototype.load = function (data)
{
    this.showControls              = Boolean(data.showControls);
    // XXX: Don't load this, use the prototype one since I don't have any UI control for it
    //this.debugTangents             = Boolean(data.debugTangents);
    this.drawStyle                 = data.drawStyle;
    this.steps                     = data.steps;
    this.pointSize                 = data.pointSize;
    this.pointColor                = data.pointColor;
    this.pathSize                  = data.pathSize;
    this.pathColor                 = data.pathColor;
    this.controlPointSize          = data.controlPointSize;
    this.controlPointColor         = data.controlPointColor;
    this.controlPointColorSelected = data.controlPointColorSelected;
    this.tangentScale              = data.tangentScale || 1.0;
    this.tangentPathSize           = data.tangentPathSize;
    this.tangentPathColor          = data.tangentPathColor;
    this.tangentPointSize          = data.tangentPointSize;
    this.tangentPointColor         = data.tangentPointColor;

    for (var i = 0; i < data.curves.length; i++)
    {
        var c = new Curve(null, null, this.log);
        c.load(data.curves[i]);
        this.curves.push(c);
    }
}


// Serialize curves, state to JSON expression
CurveManager.prototype.serialize = function ()
{
    var str = "{";

    str += "\"showControls\":"              +      this.showControls              + ",";
    str += "\"debugTangents\":"             +      this.debugTangents             + ",";
    str += "\"drawStyle\":"                 +      this.drawStyle                 + ",";
    str += "\"steps\":"                     +      this.steps                     + ",";
    str += "\"pointSize\":"                 +      this.pointSize                 + ",";
    str += "\"pointColor\":"                +"\""+ this.pointColor                +"\""+ ",";
    str += "\"pathSize\":"                  +      this.pathSize                  + ",";
    str += "\"pathColor\":"                 +"\""+ this.pathColor                 +"\""+ ",";
    str += "\"controlPointSize\":"          +      this.controlPointSize          + ",";
    str += "\"controlPointColor\":"         +"\""+ this.controlPointColor         +"\""+ ",";
    str += "\"controlPointColorSelected\":" +"\""+ this.controlPointColorSelected +"\""+ ",";
    str += "\"tangentScale\":"              +      this.tangentScale              + ",";
    str += "\"tangentPathSize\":"           +      this.tangentPathSize           + ",";
    str += "\"tangentPathColor\":"          +"\""+ this.tangentPathColor          +"\""+ ",";
    str += "\"tangentPointSize\":"          +      this.tangentPointSize          + ",";
    str += "\"tangentPointColor\":"         +"\""+ this.tangentPointColor         +"\""+ ",";
    str += "\"curves\": [";

    for (var i = 0; i < this.curves.length; i++)
        str += this.curves[i].serialize() + (i < this.curves.length-1 ? "," : "");

    str += "]}";

    // Run it through the JSON parse for formatting if available.
    if (JSON != null && JSON.parse != null)
    {
        var data = JSON.parse(str);
        str = JSON.stringify(data, null, 2);
    }

    return str;
}


// Delete given curve from this.curves, if curve was selected, selection will be cleared (and user
// should disregard the previously obtained selection object).
CurveManager.prototype.deleteCurve = function (curve)
{
    for (var i  = 0; i < this.curves.length; i++)
    {
        if (this.curves[i] === curve)
        {
            if (curve === this.selection.curve)
                this.clearSelection();

            this.curves.splice(i, 1);
        }
    }
}


// Helper function, return true if distance between two points is less than or equal to distance
// given
CurveManager.prototype.inRange = function (ax, ay, bx, by, d)
{
    var dx = ax - bx,
        dy = ay - by;

    return (dx*dx + dy*dy <= d*d);
}


// Translate curve that selection is part of
CurveManager.prototype.translateSelectionCurve = function (x, y)
{
    if (this.selection)
    {
        for (var i = 0; i < this.selection.curve.nodes.length; i++)
        {
            this.selection.curve.nodes[i].x += x;
            this.selection.curve.nodes[i].y += y;
        }
    }
}


// Translate selection
CurveManager.prototype.translateSelection = function (x, y)
{
    var scale = 1/this.tangentScale; // Account for scaled tangents
    var curve = this.selection.curve;
    var node = this.selection.node;
    var tangent = this.selection.tangent;

    if (!node) return;

    if (!tangent)
        curve.setPosition(node, node.x+x, node.y+y);

    else if (tangent === this.selection.node.in)
        curve.setTangent(node, true, node.in.x-(x*scale), node.in.y-(y*scale));
    
    else if (tangent === this.selection.node.out)
        curve.setTangent(node, false, node.out.x+(x*scale), node.out.y+(y*scale));
}


// Select a node/tangent. For every curve, test if coords are near any of its nodes position, or
// tangent end-points. Return selection object if any of the tests if succesful, or false otherwise.
// Selection is tracked internally so it can be drawn differently. The selection state is cleared on
// the next call to this function or if clearSelection() is called.
CurveManager.prototype.select = function (x, y)
{
    var curve, node;
    var s = this.tangentScale;

    // Don't do any selection when no controls are being drawn
    if (!this.showControls) return; 

    for (var i = 0; i < this.curves.length; i++)
    {
        curve = this.curves[i];

        // Also consider tangents for already selected curves
        if (this.selection && curve == this.selection.curve)
        {
            for (var j = 0; j < curve.nodes.length; j++)
            {
                // Skip if this node has no user-adjustable tangent.
                if (!curve.tangentsAreAdjustable(j)) continue;

                node = curve.nodes[j];

                if ((j != 0) && this.inRange(x, y, node.x - node.in.x*s, node.y - node.in.y*s,
                                           this.controlPointSize))
                {
                    return this.selection = { curve: curve, node: node, tangent: node.in };
                }
                if ((j != curve.nodes.length-1) && this.inRange(x, y, node.x + node.out.x*s,
                                                    node.y + node.out.y*s, this.controlPointSize))
                {
                    return this.selection = { curve: curve, node: node, tangent: node.out };
                }
            }
        }

        // Now just check node positions
        for (var j = 0; j < curve.nodes.length; j++)
        {
            node = curve.nodes[j];

            if (this.inRange(x, y, node.x, node.y, this.controlPointSize))
            {
                return this.selection = { curve: curve, node: node, tangent: null };
            }
        }
    }
    this.selection = null;
    return false;
}


// Clear current selection
CurveManager.prototype.clearSelection = function ()
{
    this.selection = null;
}


// Helper function to draw a circle onto the canvas
CurveManager.prototype.drawCircle = function(x, y, radius, color)
{
    this.context.fillStyle = color;
    this.context.beginPath();
    this.context.arc(x, y, radius, 0, 2*Math.PI, 0);
    this.context.closePath();
    this.context.fill();
}


// Draw tangents using paths and circles
CurveManager.prototype.drawTangents = function (curve)
{
    var node;
    var s = this.tangentScale || 1.0;

    this.context.strokeStyle = this.tangentPathColor;
    this.context.lineWidth   = this.tangentPathSize;
    this.context.beginPath();

    for (var i = 0; i < curve.nodes.length; i++)
    {
        if (!curve.tangentsAreAdjustable(i) && !this.debugTangents) continue;

        var node = curve.nodes[i];

        // Draw line from point to point-incoming tangent (unless we're on node 0)
        if (i != 0)
        {
            this.context.moveTo(node.x, node.y);
            this.context.lineTo(node.x - node.in.x*s, node.y - node.in.y*s);
        }
        // Draw line from point to point+outgoing tangent (unless we're on last node)
        if (i != curve.nodes.length-1)
        {
            this.context.moveTo(node.x, node.y);
            this.context.lineTo(node.x + node.out.x*s, node.y + node.out.y*s);
        }
    }
    this.context.closePath();
    this.context.stroke();

    // Draw circles for the end points
    for (var i = 0; i < curve.nodes.length; i++)
    {
        if (!curve.tangentsAreAdjustable(i)) continue;

        var node = curve.nodes[i];

        if (i != 0)
            this.drawCircle(node.x - node.in.x*s, node.y - node.in.y*s,
                            this.tangentPointSize, this.tangentPointColor);

        if (i != curve.nodes.length-1)
            this.drawCircle(node.x + node.out.x*s, node.y + node.out.y*s,
                            this.tangentPointSize, this.tangentPointColor);
    }
}


// Draw control points using circles
CurveManager.prototype.drawControlPoints = function (curve)
{
    for (var i in curve.nodes)
    {
        if (this.selection && curve.nodes[i] === this.selection.node)
            this.drawCircle(curve.nodes[i].x, curve.nodes[i].y,
                            this.controlPointSize, this.controlPointColorSelected);
        else
            this.drawCircle(curve.nodes[i].x, curve.nodes[i].y,
                            this.controlPointSize, this.controlPointColor);
    }
}


// Draw curve as a series of straight lines
CurveManager.prototype.drawCurvePath = function (curve)
{
    var cur;

    // Get starting position and moveTo() it..
    var start = curve.eval(0);

    this.context.strokeStyle = this.pathColor;
    this.context.lineWidth   = this.pathSize;
    this.context.beginPath();
    this.context.moveTo(start.x, start.y);

    for (var i = 1; i <= this.steps; i++)
    {
        cur = curve.eval((1.0/this.steps)*i);
        this.context.lineTo(cur.x, cur.y);
    }
    this.context.stroke();
    this.context.closePath();
}


// Draw curve as series of dots
CurveManager.prototype.drawCurveDots = function (curve)
{
    var cur, pi2 = Math.PI*2;

    this.context.fillStyle = this.pointColor;

    for (var i = 0; i <= this.steps; i++)
    {
        cur = curve.eval((1.0/this.steps)*i);
        this.context.beginPath();
        this.context.arc(cur.x, cur.y, this.pointSize, 0, pi2, 0);
        this.context.closePath();
        this.context.fill();
    }
}


CurveManager.prototype.redraw = function ()
{
    this.context.clearRect(0,0, this.canvas.width, this.canvas.height);

    for (var i = 0; i < this.curves.length; i++)
    {
        var curve = this.curves[i];

        if      (this.drawStyle == CurveManager.STYLE.path) this.drawCurvePath(curve);
        else if (this.drawStyle == CurveManager.STYLE.dots) this.drawCurveDots(curve);

        if (this.showControls)
        {
            if ( ( selection && selection.curve == curve &&
                   (curve.hasUserTangents() || this.debugTangents) ) )
            {
                this.drawTangents(curve);
            }

            this.drawControlPoints(curve);
        }
    }
}

