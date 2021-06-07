# iTwin Viewer - "Hello World"

## Customizing the iTwin Viewer - "The Basics"

### Prerequisites

This tutorial assumes that you already have:

- Your own local source for the iTwin Web Viewer based on the template @itwin/web-viewer
  - Instructions for that can be found [here]($docs/learning/tutorials/develop-web-viewer/)
- Configured your local source to open the "House Model" sample iModel.
  - Instructions to use this sample iModel can be found [here]($docs/learning/tutorials/create-test-imodel-sample/).

![HelloWorldAbove]($docs/learning/tutorials/images/hello_world_above.png)

### Goal

This tutorial will take you through the first steps of customizing your iTwin Web Viewer.  First you will learn how to add a new user interface component.  Later you will customize that component to change the background color of your viewer.

### Hello World

The iTwin Web Viewer viewer template generates several files. To start with, let's take a look at the ```App.tsx``` file.  This is where you should start in customizing your iTwin Viewer.

To start with ```App.tsx``` contains a single react functional component fittingly called ```App```.  The ```App``` component is responsible for:

1. Authenticating the user
2. Rendering the ```Viewer``` component

At the bottom of ```App.tsx``` you can see the ```return``` statement where the ```Viewer``` component is configured.  Let's focus on that for the now:

``` typescript
  return (
    <div className="viewer-container">
      <Header
        handleLogin={onLoginClick}
        loggedIn={isAuthorized}
        handleLogout={onLogoutClick}
      />
      {isLoggingIn ? (
        <span>"Logging in...."</span>
      ) : (
        isAuthorized && (
          <Viewer
            contextId={process.env.IMJS_CONTEXT_ID ?? ""}
            iModelId={process.env.IMJS_IMODEL_ID ?? ""}
            authConfig={{ oidcClient: AuthorizationClient.oidcClient }}
          />
        )
      )}
    </div>
  );
```

```App``` is just a react component. Like any react component, it returns JSX to tell react how to create HTML for the browser to render.  Let's start off by adding some custom code to our JSX.  We can render a "Hello World" ```span```  above the viewer by simply creating the element above the component. Note that this needs to be surrounded in a ```div```  per the single parent rule for react:

``` HTML
    <div style={{height: "100%"}}>
      <span>"Hello World"</span>
      <Viewer
        contextId={process.env.IMJS_CONTEXT_ID ?? ""}
        iModelId={process.env.IMJS_IMODEL_ID ?? ""}
        authConfig={{ oidcClient: AuthorizationClient.oidcClient }}
      />
    </div>
```

Result:

![HelloWorldAbove]($docs/learning/tutorials/images/hello_world_above.png)

### Your first UI Widget

So far, we haven't done anything to change the way the viewer works.  We've only just added a new ```span``` element *above* the viewer. To add our "Hello World" ```span``` into the viewer, we need to pass the ```uiProviders``` prop to the ```Viewer```  component, like this:

``` HTML
      <Viewer
        contextId={process.env.IMJS_CONTEXT_ID ?? ""}
        iModelId={process.env.IMJS_IMODEL_ID ?? ""}
        authConfig={{ oidcClient: AuthorizationClient.oidcClient }}
        uiProviders={[new MyFirstUiProvider()]}
      />
  );
```

The ```uiProviders``` prop is typed to require an array of objects that implements the [UIItemsProvider]($docs/reference/ui-abstract/uiitemsprovider/uiitemsprovider/) interface.  Passing in the array will allow us to extend the ```Viewer``` with custom UI components. To do that, we need to define our ```MyFirstUiProvider``` class so that it implements the ```UiItemsProvider``` interface.  Our new provider will tell the ```Viewer``` to include our "Hello world" ```span``` within the view.

Create a new file called ```MyFirstUiProvider.tsx``` with the following contents:

``` typescript
import { AbstractWidgetProps, StagePanelLocation, StagePanelSection, UiItemsProvider } from "@bentley/ui-abstract";

import * as React from "react";

export class MyFirstUiProvider implements UiItemsProvider {
  public readonly id = "MyFirstProviderId";

  public provideWidgets(stageId: string, stageUsage: string, location: StagePanelLocation, section?: StagePanelSection) : ReadonlyArray<AbstractWidgetProps> {
    const widgets: AbstractWidgetProps[] = [];

    if (location === StagePanelLocation.Right && section === StagePanelSection.Start) {
      const helloWidget: AbstractWidgetProps = {
        id: "HelloWidget",
        label: "Hello",
        getWidgetContent() {
          return <span>"Hello World"</span>;
        }
      }

      widgets.push(helloWidget);
    }

    return widgets;
  }
}
```

Let's review that code.  We've defined our new ```MyFirstUiProvider``` class.  In the new class we've defined ``` public readonly id ``` which is required to distinguish between different providers.  Then notice that we've defined just one function called ``` provideWidgets ```.  This function will be called several times as the ```Viewer``` is building up the user interface.  We will return an empty array except for when the ```location``` is equal to ```StagePanelLocation.Right``` and ```section``` is equal to ```StagePanelSection.Start```.  In that case, we will return a single widget that will supply our "Hello World" ```span```.

Our ```helloWidget``` consists of three attributes:

1. ``` id ``` - used to uniquely identify the widget
2. ``` label ``` - description label for our widget
3. ``` getWidgetContent() ``` - returns our custom UI component

At this point we need to import ```MyFirstUiProvider``` at the top of file ```App.tsx```:

``` Typescript
import { MyFirstUiProvider } from "./MyFirstUiProvider";
```

Finally, let's clean up the ```span``` and ```div``` that we added directly into the ```App``` component earlier.  Now the ``` return ``` statement in ```App.tsx``` should look like this:

``` typescript
  return (
    <div className="viewer-container">
      <Header
        handleLogin={onLoginClick}
        loggedIn={isAuthorized}
        handleLogout={onLogoutClick}
      />
      {isLoggingIn ? (
        <span>"Logging in...."</span>
      ) : (
        isAuthorized && (
          <Viewer
            contextId={process.env.IMJS_CONTEXT_ID ?? ""}
            iModelId={process.env.IMJS_IMODEL_ID ?? ""}
            authConfig={{ oidcClient: AuthorizationClient.oidcClient }}
            uiProviders={[new MyFirstUiProvider()]}
          />
        )
      )}
    </div>
  );
```

Now we have our "Hello World" ```span``` displaying in a panel within the ```Viewer``` component.  It should look like this:

![HelloWorldWidget]($docs/learning/tutorials/images/hello_world_widget.png)

### Beyond Hello World

Saying hello to the world can be fun but we need to get past that.  For this next step we'll swap out our trivial ```helloWidget``` with something a little more interactive: a [Toggle]($docs/reference/ui-core/toggle/toggle/).  Eventually this toggle will control the background color, so we'll name our new widget ```backgroundColorWidget```.  Instead of returning a ```span``` we'll return a ```Toggle```.

Start by navigating back to ```MyFirstUiProvider.tsx``` and adding an import for ```Toggle``` at the top of the file:

``` typescript
import { Toggle } from "@bentley/ui-core";
```

Next switch out the ```helloWidget``` with the new ```backgroundColorWidget``` here:

``` typescript
    if (location === StagePanelLocation.Right) {
      const backgroundColorWidget: AbstractWidgetProps = {
        id: "BackgroundColorWidget",
        label: "Background Color Toggle",
        getWidgetContent() {
          return <Toggle />
        }
      }

      widgets.push(backgroundColorWidget);
    }
```

Notice the only significant difference is that ```getWidgetContent``` is now returning a ```Toggle```.  It doesn't do anything interesting yet, but it should look like this:

![Background Color Toggle]($docs/learning/tutorials/images/background_color_toggle.png)

### Changing the background color

For this last step, let's put our new toggle to work.  We want the toggle to control the background color in the view of our house iModel.  When the toggle is on, we'll override the background color to "skyblue". When the toggle is off, we'll change the background color back to its original color.

To do this, we need to pass the ```onChange``` prop to the ```Toggle``` component like this:

``` typescript
          return <Toggle onChange={(toggle) => {
            if (MyFirstUiProvider.toggledOnce === false) {
              MyFirstUiProvider.originalColor = IModelApp.viewManager.selectedView!.displayStyle.backgroundColor.tbgr;
              MyFirstUiProvider.toggledOnce = true;
            }

            const color = toggle ? ColorDef.computeTbgrFromString("skyblue") : MyFirstUiProvider.originalColor;
            IModelApp.viewManager.selectedView!.overrideDisplayStyle({backgroundColor: color})
          }} />
```

Since we're using two new static variables here, we need to add this to to our ```MyFirstUiProvider``` class at the beginning of our definition:

``` typescript
export class MyFirstUiProvider implements UiItemsProvider {
  public readonly id = "HelloWorldProvider";
  public static toggledOnce: boolean = false;
  public static originalColor: number;
```

The first condition checks for only the first trigger of the toggle using boolean ```toggledOnce```. If true, we need to store the original color in static variable ```MyFirstUiProvider.originalColor```. We are using the global singleton [IModelApp]($docs/reference/imodeljs-frontend/imodelapp/imodelapp/) to get to the viewManager that can provide the current ```backgroundColor```. We also need to flip variable ```MyFirstUiProvider.toggledOnce``` to true to make sure we only store the original color once.

Notice we're using the function [overrideDisplayStyle()]($docs/reference/imodeljs-frontend/views/viewport/overridedisplaystyle/) on the currently selected view.  To get the view, we use the same global singleton [IModelApp]($docs/reference/imodeljs-frontend/imodelapp/imodelapp/) to get to the [viewManager]($docs/reference/imodeljs-frontend/views/viewmanager/).

Our completed ```MyFirstUiProvider.tsx``` file should look similar to this:

``` typescript
import { ColorDef } from "@bentley/imodeljs-common";
import { IModelApp } from "@bentley/imodeljs-frontend";
import { AbstractWidgetProps, StagePanelLocation, StagePanelSection, UiItemsProvider } from "@bentley/ui-abstract";
import { Toggle } from "@bentley/ui-core";

import * as React from "react";

export class MyFirstUiProvider implements UiItemsProvider {
  public readonly id = "HelloWorldProvider";
  public static toggledOnce: boolean = false;
  public static originalColor: number;

  public provideWidgets(stageId: string, stageUsage: string, location: StagePanelLocation, section?: StagePanelSection) : ReadonlyArray<AbstractWidgetProps> {
    const widgets: AbstractWidgetProps[] = [];
    if (location === StagePanelLocation.Right && section === StagePanelSection.Start) {

      const backgroundColorWidget: AbstractWidgetProps = {
        id: "BackgroundColorWidget",
        label: "Background Color Toggle",
        getWidgetContent() {
          return <Toggle onChange={(toggle) => {
            if (MyFirstUiProvider.toggledOnce === false) {
              MyFirstUiProvider.originalColor = IModelApp.viewManager.selectedView!.displayStyle.backgroundColor.tbgr;
              MyFirstUiProvider.toggledOnce = true;
            }

            const color = toggle ? ColorDef.computeTbgrFromString("skyblue") : MyFirstUiProvider.originalColor;
            IModelApp.viewManager.selectedView!.overrideDisplayStyle({backgroundColor: color})
          }} />
        }
      }

      widgets.push(backgroundColorWidget);
    }

    return widgets;
  }
}
```

Result when the toggle is on:

![Background blue]($docs/learning/tutorials/images/background_toggled_blue.png)

Result when the toggle is off:

![Background original]($docs/learning/tutorials/images/original_background_color.png)

### What's next?

This is one of infinitely many possible widgets we can create in the iTwin Viewer. Feel free to explore sample widgets on our [sample showcase](https://www.itwinjs.org/sample-showcase/).

In the next tutorial, we will take widgets from the sample showcase and use them in our iTwin Viewer.

## Useful Links

- [Web Viewer]($docs/learning/tutorials/develop-web-viewer/)
- [UI Provider]($docs/reference/ui-abstract/uiitemsprovider/uiitemsprovider/)
- [IModelApp]($docs/reference/imodeljs-frontend/imodelapp/imodelapp/)
- [Sample House Model]($docs/learning/tutorials/create-test-imodel-sample/)

## Next Steps

- [iTwin Sample Showcase](https://www.itwinjs.org/sample-showcase/)
