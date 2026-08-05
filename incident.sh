#!/bin/sh
# incident.sh : à lancer SUR la machine cible, sans regarder le résultat.
#   ssh -i deploy_key -p 2222 root@localhost 'sh -s' < incident.sh
# Tire une panne au hasard parmi cinq et n'affiche rien : connaître la liste
# ne donne aucun avantage, toute la difficulté est de reconnaître LAQUELLE.
# Débriefing (une fois le service rétabli) :
#   ssh -i deploy_key -p 2222 root@localhost "base64 -d /root/.incident"
N=$(( $(od -An -N1 -tu1 /dev/urandom) % 5 + 1 ))
echo "$N" | base64 > /root/.incident        # la réponse, pour le débriefing seulement
IMAGE=$(docker inspect -f '{{.Config.Image}}' todo-api)

case "$N" in
  1) docker stop todo-api ;;                                # plus personne ne répond
  2) docker stop todo-db ;;                                 # l'API répond, la base a disparu
  3) NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' todo-api | awk '{print $1}')
     docker network disconnect "$NET" todo-api ;;           # la base tourne, mais l'API ne la joint plus
  4) docker rm -f todo-api
     docker run -d --name todo-api -p 3000:3000 "$IMAGE" ;; # relancée sans sa configuration
  5) for i in 1 2 3 4; do
       docker run -d --name hog-$i alpine sh -c 'while :; do :; done'
     done ;;                                                # la machine ne respire plus
esac
