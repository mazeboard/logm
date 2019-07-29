package com.carrefour.fr.logm.sparksql;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

public class FetchSupport {
	private <T> List<T> toList(Iterator<T> iter) {
		ArrayList<T> res = new ArrayList<T>();
	    iter.forEachRemaining(res::add);
	    return res;
	}


}
