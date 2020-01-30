<?php

$filename = "curvejson.js";

if ($_SERVER['REQUEST_METHOD'] == 'POST')
{
    $postdata = file_get_contents("php://input");

    // Check if JSON data can be decoded before actually saving it
    if (json_decode($postdata) !== NULL)
    {
        file_put_contents($filename, $postdata);
        echo "saved";
    }
    else
    {
        echo "invalid_json";
    }
}
else
{
    header("Content-Type: application/json");

    echo file_get_contents($filename);
}

?>
