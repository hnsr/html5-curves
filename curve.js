
function Curve(type, nodes, logFunc)
{
    if (logFunc)
        this.log = function (msg) { logFunc("Curve: "+msg); };
    else
        this.log = alert;

    this.setType(type);

    if (nodes) this.setNodes(nodes);
}

// Indicates freedom allowed for in/out tangents of an interior point, only relevant for curve types
// that give full tangent control (for now just hermite)
Curve.NODE_TYPE =
{
    equal:     0, // Tangents are equal 
    direction: 1, // Tangent directions (but not magnitudes) are equal
    not_equal: 2  // Tangents are not equal
};


Curve.TYPE =
{
    linear:           0,
    lagrange:         1, // lagrange polynomial

    hermite:          2, // hermite curve

    catmullrom:       3, // Base interior points' tangents on the vector between its neighbours.
                         // Unlike most catmull-rom implementations I do draw a curve between the
                         // outermost points, using ENDPOINT_TYPE to decide what to use as the
                         // tangent at the first and last points.

    hermite_lagrange: 4, // Uses a lagrange polynomial over interior points and their
                         // neighbors to get the tangent at the interior point

    clamped_cspline:  5, // clamped cubic spline
    natural_cspline:  6  // natural cubic spline
};

// For curves that automatically generate tangents for interior points but not the endpoint; this
// indicates what method is used to deal with tangents for the endpoints.
Curve.ENDPOINT_TYPE =
{
    manual:   0, // Manually specified
    neighbor: 1, // Point tangent directly at neighboring point
    phantom:  2  // Use phantom point based on two neighboring points.
};


Curve.prototype.type          = 0;
Curve.prototype.endpoint_type = 0;
Curve.prototype.eval          = null;
Curve.prototype.timeStep      = 0;


// Load curve from decoded JSON data
Curve.prototype.load = function(data)
{   
    this.setEndPointType(data.endpoint_type || Curve.ENDPOINT_TYPE.manual);
    this.setType(data.type);
    this.setNodes(data.nodes);
}


// Serialize curve to JSON expression
Curve.prototype.serialize = function()
{
    var node;
    var str = "{";

    str += "\"type\":"+this.type+",";
    str += "\"endpoint_type\":"+this.endpoint_type+",";
    str += "\"nodes\":[";

    for (var i = 0; i < this.nodes.length; i++)
    {
        node = this.nodes[i];

        str += "{";
        str += "\"type\":"+node.type+",";
        str += "\"x\":"+node.x+",";
        str += "\"y\":"+node.y+",";
        str += "\"in\":  {\"x\": "+
            node["in"].x + // FIXME FIXME FIXME 'in' really is reserved and breaks in safari!
            ", \"y\": " +
            node["in"].y +
            "},";
        str += "\"out\": {\"x\": "+node.out.x+", \"y\": "+node.out.y+"}";
        str += "}";

        if (i < this.nodes.length-1) str += ",";
    }

    return str + "]}";
}


// Returns true if the node for the given node_index has user-adjustable tangents (this logic was
// getting a bit complicated due to various curve-types and auto-tangent methods, so it makes sense
// to have it in one place)
Curve.prototype.tangentsAreAdjustable = function (node_index)
{
    // All nodes adjustable
    if ( this.type == Curve.TYPE.hermite )
        return true;

    // First/last nodes adjustable
    if ( node_index == 0 || node_index == this.nodes.length-1 )
    {
        if ( this.hasEndPointTangentOptions() && this.endpoint_type == Curve.ENDPOINT_TYPE.manual )
            return true;

        if ( this.type == Curve.TYPE.clamped_cspline )
            return true;
    }

    return false;
}


// Returns true if the curve has any adjustable tangents at all
Curve.prototype.hasUserTangents = function ()
{
    if (this.type == Curve.TYPE.hermite ||
        this.type == Curve.TYPE.clamped_cspline )
        return true;

    if (this.endpoint_type == Curve.ENDPOINT_TYPE.manual && this.hasEndPointTangentOptions())
        return true;

    return false;
}


// Returns true if this curve type supports end point tangent options (i.e. wether or not
// Curve.endpoint_type is relevant).
Curve.prototype.hasEndPointTangentOptions = function ()
{
    if ( this.type == Curve.TYPE.catmullrom ||
         this.type == Curve.TYPE.hermite_lagrange )
       return true;
}


// Set start/end tangents to point to their neighbours
Curve.prototype.setNeighborEndPointTangents = function ()
{
    var start     = this.nodes[0],
        startnext = this.nodes[1],
        endprev   = this.nodes[this.nodes.length-2];
        end       = this.nodes[this.nodes.length-1],

    start.in.x = start.out.x = startnext.x -   start.x;
    start.in.y = start.out.y = startnext.y -   start.y;
      end.in.x =   end.out.x =       end.x - endprev.x;
      end.in.y =   end.out.y =       end.y - endprev.y;
}


// Set start/end tangents to point toward a phantom point based on next two neighbors
Curve.prototype.setPhantomEndPointTangents = function ()
{
    var len = this.nodes.length;

    // We need at least 3 nodes, if we have only 2, fallback to NeighborEndPointTangents.
    if (len < 3) return this.setNeighborEndPointTangents();

    // phantom = p1+(p1-p2)
    // new tangent = phantom - p0 = p1*2 - p2 - p0

    var p0 = this.nodes[0], p1 = this.nodes[1], p2 = this.nodes[2];

    p0.in.x = p0.out.x = p1.x*2 - p2.x - p0.x;
    p0.in.y = p0.out.y = p1.y*2 - p2.y - p0.y;

    // Same thing at the other end, but I have to negate the tangent (due to moving along curve from
    // start to end, don't let the reflected tangent control fool you)
    p0 = this.nodes[len-1], p1 = this.nodes[len-2], p2 = this.nodes[len-3];

    p0.in.x = p0.out.x = -(p1.x*2 - p2.x - p0.x);
    p0.in.y = p0.out.y = -(p1.y*2 - p2.y - p0.y);
}


// Update endpoint tangents if relevant for current curve type/endpoint type.
Curve.prototype.updateEndPointTangents = function ()
{
    if (!this.hasEndPointTangentOptions()) return;

    if (this.endpoint_type == Curve.ENDPOINT_TYPE.neighbor) this.setNeighborEndPointTangents();
    if (this.endpoint_type == Curve.ENDPOINT_TYPE.phantom)  this.setPhantomEndPointTangents();
}

// Update tangents for curves with automatic tangent generation. Should be called whenever nodes are
// added, deleted, translated, or when tangents (i.e. for clamped splines) are adjusted.
Curve.prototype.updateTangents = function ()
{
    if (!this.nodes) return;

    // Quick and dirty vector math functions for cspline code
    // FIXME: move this somewhere else
    function vmul(v, r) { return { x: v.x*r,   y: v.y*r   }; }
    function vsub(a, b) { return { x: a.x-b.x, y: a.y-b.y }; }

    // Loop over all the interior points, get vectors to neghboors, average them, set as in/out.
    if (this.type == Curve.TYPE.catmullrom)
    {
        var nprev, n, nnext;

        for (var i = 1; i < this.nodes.length-1; i++)
        {
            nprev = this.nodes[i-1];
            n     = this.nodes[i];
            nnext = this.nodes[i+1];

            n.in.x = n.out.x = (nnext.x - nprev.x)/2;
            n.in.y = n.out.y = (nnext.y - nprev.y)/2;
        }
    }
    else if (this.type == Curve.TYPE.hermite_lagrange)
    {
        var n0, n1, n2, p0, p1, p2;
        var t0 = 0, t1 = 0.5, t2 = 1;

        for (var i = 1; i < this.nodes.length-1; i++)
        {

            n0 = this.nodes[i-1];
            n1 = this.nodes[i];
            n2 = this.nodes[i+1];

            // Get first derivative of lagrange over n0-n2 at n1. 
            p0 = (t1-t2)      / ((t0-t1)*(t0-t2));
            p1 = (2*t1-t0-t2) / ((t1-t0)*(t1-t2));
            p2 = (t1-t0)      / ((t2-t0)*(t2-t1));

            n1.in.x = n1.out.x =  p0*n0.x + p1*n1.x + p2*n2.x;
            n1.in.y = n1.out.y =  p0*n0.y + p1*n1.y + p2*n2.y;
        }
    }
    else if (this.type == Curve.TYPE.clamped_cspline)
    {
        // To generate the tangets we need to solve a tridiagonal matrix equation using the Thomas
        // algo. (Essential Math. p. 434) This code is a bit different from the generic algorithm
        // since all the coefficients follow a pattern and the system I am solving is also a bit
        // different than the system shown in the derivation in the book since I don't need to
        // solve for the start/end tangents

        // All diagonal entries equal 4, all super/subdiagonal entries equal 1.
        var n = this.nodes.length;
        var u = n - 2; // Number of equations in our system, 2 less since we know start/end tangents
        var p = this.nodes;

        // First, calculate the modified superdiagonal coefficients (cmod) and modified right side
        // (dmod)
        var cmod = [], dmod = [];

        cmod[0] =  1/4;

        // d[0] = 3(p[2] - p[0]) - v0; v0 = start tangent
        // dmod[0] = d[0] / 4;
        dmod[0] = vmul(vsub(vmul(vsub(p[2], p[0]), 3), p[0].out), 0.25);

        for (var i = 1; i < u-1; i++)
        {
            cmod[i] = 1 / (4 - cmod[i-1]);

            var d = vmul(vsub(p[i+2], p[i]), 3);
            dmod[i] = vmul(vsub(d, dmod[i-1]) , 1/(4-cmod[i-1]));
        }

        var     d = vsub(vmul(vsub(p[u+1], p[u-1]), 3), p[n-1].in);
        dmod[u-1] = vmul(vsub(d, dmod[u-2]) , 1/(4-cmod[u-2]));

        // Calculate final tangents by back-substitution. Keep in mind that I'm writing the tangents
        // directly into p[], where we start at index n-2 down to 1 (skipping the first and last
        // user-defined tangents).
        p[n-2].in.x = p[n-2].out.x = dmod[u-1].x;
        p[n-2].in.y = p[n-2].out.y = dmod[u-1].y;

        for (var i = u-2; i >= 0; i--)
        {
            var t = vsub(dmod[i], vmul(p[i+2].in, cmod[i]));

            p[i+1].in.x = p[i+1].out.x = t.x;
            p[i+1].in.y = p[i+1].out.y = t.y;
        }
    }
    else if (this.type == Curve.TYPE.natural_cspline)
    {
        // Mostly the same as clamped_cspline, but things are simplified slightly differently due to
        // different coefficients
        var n = this.nodes.length;
        var p = this.nodes;

        var d;
        var cmod = [ 0.5 ];
        var dmod = [ vmul(vsub(p[1], p[0]), 1.5) ]; // d1/b1 = 3(P1 - P0) / 2 = 1.5(P1 - P0)

        for (var i = 1; i < n-1; i++) // a_i, c_i always equal 1, b_i is always 4
        {
            cmod[i] = 1 / (4 - cmod[i-1]);

            d       = vmul(vsub(p[i+1], p[i-1]), 3);
            dmod[i] = vmul(vsub(d, dmod[i-1]), 1/(4 - cmod[i-1]) );
        }

        // Special case for last dmod
        d       = vmul(vsub(p[n-1], p[n-2]), 3);
        dmod[n-1] = vmul(vsub(d, dmod[n-2]), 1/(2 - cmod[n-2]) );

        // back-substitute XXX: move to function? this is identical to clamped_cspline
        p[n-1].in.x = p[n-1].out.x = dmod[n-1].x;
        p[n-1].in.y = p[n-1].out.y = dmod[n-1].y;

        for (var i = n-2; i >= 0; i--)
        {
            var t = vsub(dmod[i], vmul(p[i+1].in, cmod[i]));

            p[i].in.x = p[i].out.x = t.x;
            p[i].in.y = p[i].out.y = t.y;
        }
    }

    this.updateEndPointTangents();
}


// Insert a new node (new_node) before (if before is true) or after the reference node (ref_node).
Curve.prototype.insertNode = function (node_ref, before, new_node)
{
    var insert_index = null;

    // Find insertion index of node_ref
    for (var i in this.nodes)
    {
        if (this.nodes[i] == node_ref)
        {
            insert_index = before ? Number(i) : Number(i)+1;
            break;
        }
    }

    if (insert_index === null)
    {
        this.log("insertNode: invalid node_ref");
        return;
    }

    this.nodes.splice(insert_index, 0, new_node);
    this.setNodes(this.nodes);
    this.updateTangents();
}


// Delete a node, returns true if the node was deleted, or false. If the current number of nodes in
// the curve is less or equal to 2, no further nodes are deleted.
Curve.prototype.deleteNode = function (node)
{
    if (this.nodes.length < 3) return false;

    if ((node = this.getNodeIndex(node)) !== null)
    {
        this.nodes.splice(node, 1);
        this.setNodes(this.nodes);
        this.updateTangents();
        return true;
    }

    this.log("deleteNode: invalid node");
    return false;
}


// Return index in Curve.nodes for given node, or null if the node doesn't exist in Curve.nodes.
Curve.prototype.getNodeIndex = function (node)
{
    for (var i = 0; i < this.nodes.length; i++)
        if (this.nodes[i] === node)
            return i;

    return null;
}


// Set curve's nodes to nodes, update dependant variables
Curve.prototype.setNodes = function (nodes)
{
    this.timeStep = 1/(nodes.length-1);
    this.nodes = nodes;
    this.updateTangents();
}


Curve.prototype.setEndPointType = function (endpoint_type)
{
    this.endpoint_type = endpoint_type;
    this.updateEndPointTangents();
}


Curve.prototype.setType = function (type)
{
    this.type = type;
    this.updateTangents();
}


// Update a node's type. Makes sure that tangets are corrected when for example setting
// Curve.NODE_TYPE.equal (or .direction) where it was .not_equal before.
Curve.prototype.setNodeType = function (node, type)
{
    if (!node) return;

    node.type = type;

    // It doesn't really matter whether I correct the outgoing or incoming tangent when node type is
    // changed to equal/direction, except for the first and last nodes where only one tangent is
    // really used. So I'll correct the outgoing tangent for all nodes except the first one, where
    // I'll correct the incoming one

    // Using setTangent to trigger a correction of the other tangent, no need to duplicate that code
    // here.
    if (this.nodes[0] === node)
        this.setTangent(node, false, node.out.x, node.out.y);
    else
        this.setTangent(node, true, node.in.x, node.in.y);
}


// Update tangent for given node, and make sure the other tangent is updated accordingly depending
// on node's type.
Curve.prototype.setTangent = function (node, incoming, x, y)
{
    if (!node) return;

    var a = incoming ? node.in : node.out;
    var b = incoming ? node.out : node.in;

    a.x = x;
    a.y = y;

    // Now update the other tangent for equal/dequal modes
    if (node.type == Curve.NODE_TYPE.equal)
    {
        b.x = a.x;
        b.y = a.y;
    }
    else if (node.type == Curve.NODE_TYPE.direction)
    {
        // Copy tangent a to b, but scaled so the magnitude is preserved.
        var maga = Math.sqrt(a.x*a.x + a.y*a.y);
        var magb = Math.sqrt(b.x*b.x + b.y*b.y);
        b.x = a.x*(magb/maga);
        b.y = a.y*(magb/maga);
    }

    this.updateTangents();
}


// Set position for node
Curve.prototype.setPosition = function (node, x, y)
{
    node.x = x;
    node.y = y;
    this.updateTangents();
}


// Evaluate curve at t
Curve.prototype.eval = function(t)
{
    // change NaN values to 0
    if (isNaN(t)) t = 0;

    // Return first node x,y pos if number of nodes is < 2;
    if (this.nodes.length < 2)
        return {x: this.nodes[0].x, y: this.nodes[0].y};

    if      (this.type == Curve.TYPE.linear)           return this.evalLinear(t);
    else if (this.type == Curve.TYPE.lagrange)         return this.evalLagrange(t);
    else if (this.type == Curve.TYPE.hermite)          return this.evalHermite(t);
    else if (this.type == Curve.TYPE.catmullrom)       return this.evalHermite(t);
    else if (this.type == Curve.TYPE.hermite_lagrange) return this.evalHermite(t);
    else if (this.type == Curve.TYPE.clamped_cspline)  return this.evalHermite(t);
    else if (this.type == Curve.TYPE.natural_cspline)  return this.evalHermite(t);
    else
        return this.evalLinear(t);
}


// Evaluate piecewise linear 'curve' at t
Curve.prototype.evalLinear = function(t)
{
    var ns = this.nodes;

    if (t <= 0 || isNaN(t)) // Make sure t=NaN doesn't trip us up later
        return { x: ns[0].x, y: ns[0].y };
    else if (t >= 1)
        return { x: ns[ns.length-1].x, y: ns[ns.length-1].y };

    for (var i = 0; i < ns.length-1; i++)
    {
        if (t <= this.timeStep*(i+1))
            break;
    }

    // Linearly interpolate between point i and i+1.. by factor u
    var u = (t - this.timeStep*i) / (this.timeStep*(i+1) - this.timeStep*i);

    return {
        x: ns[i].x*(1-u) + ns[i+1].x*u,
        y: ns[i].y*(1-u) + ns[i+1].y*u
    }
}


// Evaluate curve using Lagrange polynomial
Curve.prototype.evalLagrange = function(t)
{
    var ns = this.nodes;
    var p = {x:0, y:0};

    if (t <= 0 || isNaN(t))
        return { x: ns[0].x, y: ns[0].y };
    else if (t >= 1)
        return { x: ns[ns.length-1].x, y: ns[ns.length-1].y };

    // Sum up every point scaled by Lagrange product
    for (var k = 0; k < ns.length; k++)
    {
        var lp = 1; // Lagrange product

        // Calculate Lagrange product for this point first; loop over every point except where k==i,
        // and do the product..
        for (var i = 0; i < ns.length; i++)
        {
            if (i != k)
                lp *= (t - this.timeStep*i) / (this.timeStep*k - this.timeStep*i);
        }

        p.x += ns[k].x * lp;
        p.y += ns[k].y * lp;
    }

    return p;
}


// Evaluate piecewise hermite curve at t
Curve.prototype.evalHermite = function(t)
{
    var ns = this.nodes;
    var p = {x:0, y:0};

    if (t <= 0 || isNaN(t))
        return { x: ns[0].x, y: ns[0].y };
    else if (t >= 1)
        return { x: ns[ns.length-1].x, y: ns[ns.length-1].y };

    // Find subcurve that t falls inside of
    for (var i = 0; i < ns.length-1; i++)
    {
        if (t <= this.timeStep*(i+1)) break;
    }

    // Evaluate hermite curve between point i and i+1 and associated tangents by factor u
    // (2u³ - 3u² + 1)P[i]  +  (-2u³ + 3u²)P[i+1]  +  (u³ - 2u² + u)T[i]  +  (u³ - u²)T[i+1]
    var u  = (t - this.timeStep*i) / (this.timeStep*(i+1) - this.timeStep*i);
    var u2 = u*u
    var u3 = u2*u;

    p.x = (2*u3 - 3*u2 + 1)*ns[i].x     + (-2*u3 + 3*u2)*ns[i+1].x +
            (u3 - 2*u2 + u)*ns[i].out.x +      (u3 - u2)*ns[i+1].in.x;
    p.y = (2*u3 - 3*u2 + 1)*ns[i].y     + (-2*u3 + 3*u2)*ns[i+1].y +
            (u3 - 2*u2 + u)*ns[i].out.y +      (u3 - u2)*ns[i+1].in.y;

    return p;
}

