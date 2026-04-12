The Heroku app auto deploys from the main branch. We don't use PRs, just add, commit and push to Main.
Mike's using Powershell, but also has access to WSL, so when Mike needs to run commands, you can provide either (just specify which). Usually powershell preferred unless WSL is specificially necessary.

The apps name is daber (ie heroku CLI commands look like this: heroku run -a daber -- npm -w apps/api run prisma:deploy)

 App + URLs

  - Prod app URL: https://daber-c5db59ff0df3.herokuapp.com
  - Healthcheck: GET /health → {"ok":true}
  - API: GET|PUT /api/calibration/:deviceId, GET|PUT /api/progress/:deviceId

KNOWN ISSUES AND REQUESTS:
- Move the "Mode" toggle between various models somewhere more prominent... why is it toggled inside one of the subpages when it clearly affects the entire app.
- Right now, the CNN seems to predict really poorly... no matter what scribble i draw, it always predicts Kuf. 
- On the "Draw Letter" page, it would be nice if the user could see a light example of the cursive letter they are expected to draw (ideally on the canvas, but not in a way that interferes with the user)... looking to see the 'ideal script', what the model is trained to look for... im open to exploring options here, don't implement before discussing with me. 
