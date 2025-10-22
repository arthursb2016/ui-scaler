# ui-scaler

Your best ally for easily building responsive web applications:

Build your web interface in one single resolution, and the package will scale the UI for all desktop resolutions

The package works well with any library or framework that styles defined in **rem**, such as TailwindCSS

## Demo
ui-scaler will make sure your app proportions and relative sizes are the same across all different desktop resolutions:

![UI scaler demo](ui-scaler-demo.gif)

You will also notice an easier experience when adjusting the UI for mobile resolutions, since all elements proportions will look good

## Usage

There are two usage methods:

#### 1. NPM / YARN

```
npm i ui-scaler
```

Then in your app entry point:

```JavaScript
// main.ts
import scaleUI from 'ui-scaler'

...

// last line
scaleUI()
```

#### 2. Script tag

```HTML
<head>
  <script src="https://cdn.jsdelivr.net/npm/ui-scaler@1.0.3/dist/browser-bundle.min.js"></script>
</head>
```

## How it's done

#### [A script](https://github.com/arthursb2016/ui-scaler/blob/master/src/script.ts) will be added to your app, which:

1. Has 8kb
2. Runs once the document is ready
3. Adds a window resize event listener that updates the HTML tag font-size based on the screen resolution and browser font-size
4. Optionally, adds styles transformation logic that convert pixel values to rem values (see how to activate below) 

Notice your app HTML font-size to be different in each screen resolution

All properties with **rem values** will respond and adjust accordingly the HTML font-size change on different resolutions

Font size styles take in consideration the user browser font-size definition

## Options

You can pass an argument to the `scaleUI(boolean | TransformPixelsOptions)` method, instructing the script to attempt to convert pixel values to rem:

#### Default transform options example

The script will try to convert all document pixel styles to the respective rem definition

```JavaScript
// main.ts
import scaleUI from 'ui-scaler'

...

scaleUI(true)
```

#### Custom transform options example

The script will try to convert all document pixel styles to the respective rem definition, excluding border-radius attributes, and elements with `myCustomId` id or `my-custom-class` class

```JavaScript
// main.ts
import scaleUI from 'ui-scaler'

...

scaleUI({
  excludeAttributes: ['border-radius'],
  excludeSelectors: ['#myCustomId', '.my-custom-class']
})
```

#### Bypassing transformations

You can also add the `ignore-ui-scaler` class to any HTML element so the script transformations do not have effect. Example:

```HTML
<style>
.width-300 {
  width: 300px;
}
/* Auto-generated class definition - done by the transformation script */
.width-300:not(.ignore-ui-scaler) {
  width: 18.75rem;
}
</style>

<div class="width-300 ignore-ui-scaler">
  My width will remain in pixels!
</div>
```
