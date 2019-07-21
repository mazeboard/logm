FROM eu.gcr.io/logm-fr1676-frb03577-dev/spark-py:my-tag

COPY wordcount.py /wordcount.py
COPY inputfile.txt /inputfile.txt

CMD /opt/spark/bin/spark-submit --master k8s://https://35.246.181.195 \
       --deploy-mode cluster \
       --executor-memory 1g \
       --name wordcount \
       --conf spark.executor.instances=2 \
       --conf "spark.app.id=wordcount" \
       local:///wordcount.py local:///inputfile.txt 

#CMD bin/spark-submit \
#    --master k8s://https://35.246.181.195 \
#    --deploy-mode cluster \
#    --name spark-pi \
#    --class org.apache.spark.examples.SparkPi \
#    --conf spark.executor.instances=5 \
#    #--conf spark.kubernetes.container.image=eu.gcr.io/logm-fr1676-frb03577-dev/spark:my-tag \
#    local:///example.jar 
